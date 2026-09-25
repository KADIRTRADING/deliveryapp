import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { priceLine } from "@/modules/pricing/pricing";
import type { AddCartItemInput, UpdateCartItemInput } from "@/modules/cart/schemas";
import type { Prisma } from "@prisma/client";

/**
 * Cart service.
 *
 * Carts are scoped per (user, restaurant) — a user may have a separate cart
 * open per restaurant simultaneously (schema.prisma enforces this via
 * @@unique([userId, restaurantId])), matching how most delivery apps let you
 * browse a second restaurant without losing your first cart, while still
 * only ever checking out one restaurant's cart at a time.
 *
 * CRITICAL: nothing in this service ever accepts a price from the client.
 * Every function re-fetches the live Product/ProductVariant/ModifierOption
 * rows and re-derives prices via src/modules/pricing/pricing.ts. The cart
 * itself stores only IDs and quantities — nothing priced is persisted until
 * checkout snapshots it onto the Order (Phase 4 continues into order
 * creation below).
 */

const cartInclude = {
  items: {
    include: {
      product: { include: { images: { take: 1, orderBy: { sortOrder: "asc" as const } } } },
      variant: true,
      modifiers: { include: { modifierOption: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  restaurant: { select: { id: true, slug: true, nameUz: true, nameRu: true, nameEn: true } },
} satisfies Prisma.CartInclude;

async function validateAndPriceSelection(
  productId: string,
  restaurantId: string,
  variantId: string | null | undefined,
  modifierOptionIds: string[],
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, restaurantId, deletedAt: null },
    include: {
      variants: true,
      modifierGroups: { include: { options: true } },
    },
  });
  if (!product) {
    throw ApiError.badRequest("This product does not belong to this restaurant.");
  }
  if (!product.isAvailable) {
    throw ApiError.conflict("This product is currently unavailable.");
  }

  let variant = null;
  if (variantId) {
    variant = product.variants.find((v) => v.id === variantId) ?? null;
    if (!variant) {
      throw ApiError.badRequest("The selected variant does not belong to this product.");
    }
    if (!variant.isAvailable) {
      throw ApiError.conflict("The selected variant is currently unavailable.");
    }
  }

  const allOptions = product.modifierGroups.flatMap((g) =>
    g.options.map((o) => ({ ...o, group: g })),
  );
  const selectedOptions = modifierOptionIds.map((id) => {
    const option = allOptions.find((o) => o.id === id);
    if (!option) {
      throw ApiError.badRequest(
        "One of the selected modifier options does not belong to this product.",
      );
    }
    if (!option.isAvailable) {
      throw ApiError.conflict(`The modifier option "${option.nameEn}" is currently unavailable.`);
    }
    return option;
  });

  // Enforce each modifier group's min/max selection constraints — this is a
  // server-side re-validation of what the UI is expected to enforce
  // client-side; it must never be trusted, only re-checked.
  for (const group of product.modifierGroups) {
    const selectedInGroup = selectedOptions.filter((o) => o.modifierGroupId === group.id);
    if (selectedInGroup.length < group.minSelect) {
      throw ApiError.badRequest(
        `"${group.nameEn}" requires at least ${group.minSelect} selection(s).`,
      );
    }
    if (selectedInGroup.length > group.maxSelect) {
      throw ApiError.badRequest(
        `"${group.nameEn}" allows at most ${group.maxSelect} selection(s).`,
      );
    }
  }

  return { product, variant, selectedOptions };
}

export async function getOrCreateCart(userId: string, restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || restaurant.deletedAt || restaurant.status !== "APPROVED") {
    throw ApiError.notFound("Restaurant not found");
  }

  return prisma.cart.upsert({
    where: { userId_restaurantId: { userId, restaurantId } },
    update: {},
    create: { userId, restaurantId },
    include: cartInclude,
  });
}

export async function getCart(userId: string, restaurantId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId_restaurantId: { userId, restaurantId } },
    include: cartInclude,
  });
  if (!cart) {
    throw ApiError.notFound("Cart not found");
  }
  return cart;
}

export async function addCartItem(userId: string, restaurantId: string, input: AddCartItemInput) {
  await validateAndPriceSelection(
    input.productId,
    restaurantId,
    input.variantId,
    input.modifierOptionIds,
  );

  const cart = await getOrCreateCart(userId, restaurantId);

  const item = await prisma.cartItem.create({
    data: {
      cartId: cart.id,
      productId: input.productId,
      variantId: input.variantId ?? null,
      quantity: input.quantity,
      notes: input.notes ?? null,
      modifiers: {
        create: input.modifierOptionIds.map((modifierOptionId) => ({ modifierOptionId })),
      },
    },
  });

  return getCart(userId, restaurantId).then((c) => ({ cart: c, itemId: item.id }));
}

export async function updateCartItem(
  userId: string,
  restaurantId: string,
  cartItemId: string,
  input: UpdateCartItemInput,
) {
  const cart = await prisma.cart.findUnique({
    where: { userId_restaurantId: { userId, restaurantId } },
  });
  if (!cart) {
    throw ApiError.notFound("Cart not found");
  }

  const existing = await prisma.cartItem.findFirst({ where: { id: cartItemId, cartId: cart.id } });
  if (!existing) {
    throw ApiError.notFound("Cart item not found");
  }

  const variantId = input.variantId !== undefined ? input.variantId : existing.variantId;
  let modifierOptionIds = input.modifierOptionIds;
  if (modifierOptionIds === undefined) {
    const currentModifiers = await prisma.cartItemModifier.findMany({
      where: { cartItemId: existing.id },
    });
    modifierOptionIds = currentModifiers.map((m) => m.modifierOptionId);
  }

  await validateAndPriceSelection(existing.productId, restaurantId, variantId, modifierOptionIds);

  await prisma.$transaction([
    prisma.cartItemModifier.deleteMany({ where: { cartItemId: existing.id } }),
    prisma.cartItem.update({
      where: { id: existing.id },
      data: {
        quantity: input.quantity,
        variantId,
        notes: input.notes,
        modifiers: { create: modifierOptionIds.map((modifierOptionId) => ({ modifierOptionId })) },
      },
    }),
  ]);

  return getCart(userId, restaurantId);
}

export async function removeCartItem(userId: string, restaurantId: string, cartItemId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId_restaurantId: { userId, restaurantId } },
  });
  if (!cart) {
    throw ApiError.notFound("Cart not found");
  }
  const existing = await prisma.cartItem.findFirst({ where: { id: cartItemId, cartId: cart.id } });
  if (!existing) {
    throw ApiError.notFound("Cart item not found");
  }
  await prisma.cartItem.delete({ where: { id: existing.id } });
  return getCart(userId, restaurantId);
}

export async function clearCart(userId: string, restaurantId: string) {
  const cart = await prisma.cart.findUnique({
    where: { userId_restaurantId: { userId, restaurantId } },
  });
  if (!cart) return;
  await prisma.cart.delete({ where: { id: cart.id } });
}

export async function updateCartNotes(userId: string, restaurantId: string, notes: string | null) {
  const cart = await getOrCreateCart(userId, restaurantId);
  await prisma.cart.update({ where: { id: cart.id }, data: { notes } });
  return getCart(userId, restaurantId);
}

/**
 * List all of the user's open carts (one per restaurant they've added
 * items to), for a "resume your carts" UI element. Excludes empty carts.
 */
export async function listUserCarts(userId: string) {
  return prisma.cart.findMany({
    where: { userId, items: { some: {} } },
    include: cartInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export interface PricedCartSummary {
  lines: Array<
    ReturnType<typeof priceLine> & {
      cartItemId: string;
      productId: string;
      productName: string;
      variantId: string | null;
      variantName: string | null;
      modifierOptionIds: string[];
    }
  >;
  subtotalAmount: number;
}

/**
 * Re-price every item in a cart from live data right now. Used both by the
 * cart summary endpoint (so the UI always shows server-computed totals) and
 * by checkout (Phase 4 continues into order creation, which calls this
 * again inside the same transaction as order creation for consistency).
 */
export async function priceCart(cart: {
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    product: {
      basePrice: number;
      discountedPrice: number | null;
      nameEn: string;
      isAvailable: boolean;
    };
    variant: { priceDelta: number; nameEn: string; isAvailable: boolean } | null;
    modifiers: Array<{
      modifierOptionId: string;
      modifierOption: { priceDelta: number; isAvailable: boolean };
    }>;
  }>;
}): Promise<PricedCartSummary> {
  const lines = cart.items.map((item) => {
    if (!item.product.isAvailable) {
      throw ApiError.conflict(`"${item.product.nameEn}" is no longer available.`);
    }
    if (item.variant && !item.variant.isAvailable) {
      throw ApiError.conflict(
        `The selected variant for "${item.product.nameEn}" is no longer available.`,
      );
    }
    for (const m of item.modifiers) {
      if (!m.modifierOption.isAvailable) {
        throw ApiError.conflict(
          `A selected modifier for "${item.product.nameEn}" is no longer available.`,
        );
      }
    }

    const priced = priceLine({
      basePrice: item.product.basePrice,
      discountedPrice: item.product.discountedPrice,
      variantPriceDelta: item.variant?.priceDelta ?? 0,
      modifiers: item.modifiers.map((m) => ({ priceDelta: m.modifierOption.priceDelta })),
      quantity: item.quantity,
    });

    return {
      ...priced,
      cartItemId: item.id,
      productId: item.productId,
      productName: item.product.nameEn,
      variantId: item.variantId,
      variantName: item.variant?.nameEn ?? null,
      modifierOptionIds: item.modifiers.map((m) => m.modifierOptionId),
    };
  });

  return { lines, subtotalAmount: lines.reduce((sum, l) => sum + l.lineTotal, 0) };
}
