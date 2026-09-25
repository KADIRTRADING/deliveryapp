import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/modules/restaurants/restaurants.service";
import { listMenuCategories } from "@/modules/menu/menu-categories.service";
import { listProducts } from "@/modules/menu/products.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/**
 * GET /api/restaurants/slug/:slug/menu — public menu for a restaurant's
 * ordering page.
 *
 * The existing management routes (/api/restaurants/:id/menu-categories,
 * /api/restaurants/:id/products) require an authenticated session with
 * restaurant access (owner/staff/admin) — there was previously no way for
 * an unauthenticated customer to view a restaurant's menu before adding
 * anything to a cart. This route fills that gap by reusing the existing,
 * already-tested read functions (which already default to
 * active-categories-only / available-products-only) with no auth
 * requirement, since a restaurant's menu for an APPROVED restaurant is
 * public information — the same information a customer would see printed
 * on a physical menu.
 *
 * `getRestaurantBySlug` already throws a 404 for anything that is not
 * APPROVED and not soft-deleted, so PENDING/SUSPENDED/ARCHIVED restaurants'
 * menus are not exposed here either.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const restaurant = await getRestaurantBySlug(slug);

    const [menuCategories, products] = await Promise.all([
      listMenuCategories(restaurant.id),
      listProducts(restaurant.id),
    ]);

    const categoriesWithProducts = menuCategories.map((category) => ({
      ...category,
      products: products.filter((product) => product.menuCategoryId === category.id),
    }));

    return NextResponse.json({ menuCategories: categoriesWithProducts }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
