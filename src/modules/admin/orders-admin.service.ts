import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { OrderStatus } from "@prisma/client";

/**
 * Platform-wide order oversight — per "manage orders, payments,
 * promotions and promo codes": unlike getOrderForCustomer (userId-scoped)
 * or getOrderForRestaurant (branchId-scoped), an admin may view any order
 * on the platform. Status transitions still go through the same
 * advanceOrderStatus() state machine (src/modules/orders/orders.service.ts)
 * — admins bypass only the role/branch-membership check there, never the
 * legality of the transition itself.
 */

const adminOrderInclude = {
  items: { include: { modifiers: true } },
  restaurant: { select: { id: true, slug: true, nameEn: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { id: true, phone: true, firstName: true, lastName: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
  payments: true,
} as const;

export async function listOrdersForAdmin(opts: {
  status?: OrderStatus;
  restaurantId?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.restaurantId ? { restaurantId: opts.restaurantId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: adminOrderInclude,
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getOrderForAdmin(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: adminOrderInclude,
  });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  return order;
}
