import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Platform-wide analytics for the admin panel. Per the spec's exact list:
 * "total/completed/cancelled orders, GMV, revenue, commissions, active
 * users/restaurants, restaurant performance, popular products, orders by
 * region and over time," all supporting date-range filtering.
 *
 * "Revenue" here means the platform's own revenue — the sum of
 * platformCommissionAmount across orders in range — as distinct from GMV
 * (gross merchandise value, the sum of totalAmount, i.e. everything
 * customers paid regardless of how it's split between the platform and
 * restaurants). Conflating these two would misrepresent the platform's
 * actual earnings, so they are computed and returned as separate fields.
 */

export async function getPlatformOverview(range: { from: Date; to: Date }) {
  const dateFilter = { createdAt: { gte: range.from, lte: range.to } };

  const [
    totalOrders,
    completedOrders,
    cancelledOrders,
    financials,
    activeUsers,
    activeRestaurants,
  ] = await Promise.all([
    prisma.order.count({ where: dateFilter }),
    prisma.order.count({ where: { ...dateFilter, status: "DELIVERED" } }),
    prisma.order.count({ where: { ...dateFilter, status: { in: ["CANCELLED", "REFUNDED"] } } }),
    prisma.order.aggregate({
      where: { ...dateFilter, status: "DELIVERED" },
      _sum: {
        totalAmount: true,
        platformCommissionAmount: true,
        restaurantEarningsAmount: true,
      },
    }),
    prisma.user.count({
      where: { deletedAt: null, orders: { some: dateFilter } },
    }),
    prisma.restaurant.count({
      where: { deletedAt: null, orders: { some: dateFilter } },
    }),
  ]);

  return {
    totalOrders,
    completedOrders,
    cancelledOrders,
    gmv: financials._sum.totalAmount ?? 0,
    platformRevenue: financials._sum.platformCommissionAmount ?? 0,
    restaurantEarnings: financials._sum.restaurantEarningsAmount ?? 0,
    activeUsers,
    activeRestaurants,
  };
}

export async function getRestaurantPerformance(
  range: { from: Date; to: Date },
  opts?: { take?: number },
) {
  const grouped = await prisma.order.groupBy({
    by: ["restaurantId"],
    where: { createdAt: { gte: range.from, lte: range.to }, status: "DELIVERED" },
    _count: { id: true },
    _sum: { totalAmount: true, platformCommissionAmount: true },
    orderBy: { _sum: { totalAmount: "desc" } },
    take: opts?.take ?? 20,
  });

  const restaurantIds = grouped.map((g) => g.restaurantId);
  const restaurants = await prisma.restaurant.findMany({
    where: { id: { in: restaurantIds } },
    select: { id: true, slug: true, nameEn: true, ratingAvg: true },
  });
  const restaurantById = new Map(restaurants.map((r) => [r.id, r]));

  return grouped.map((g) => ({
    restaurant: restaurantById.get(g.restaurantId) ?? null,
    orderCount: g._count.id,
    gmv: g._sum.totalAmount ?? 0,
    platformRevenue: g._sum.platformCommissionAmount ?? 0,
  }));
}

export async function getPopularProducts(
  range: { from: Date; to: Date },
  opts?: { take?: number },
) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: { createdAt: { gte: range.from, lte: range.to }, status: "DELIVERED" },
      productId: { not: null },
    },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: opts?.take ?? 20,
  });

  const productIds = grouped.map((g) => g.productId).filter((id): id is string => id !== null);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameEn: true, restaurantId: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  return grouped.map((g) => ({
    product: g.productId ? (productById.get(g.productId) ?? null) : null,
    quantitySold: g._sum.quantity ?? 0,
    revenue: g._sum.lineTotal ?? 0,
  }));
}

/**
 * Orders by region — joins through Order.branchId -> RestaurantBranch.regionId
 * rather than the customer's address region, since "orders by region" for
 * platform operations purposes means "where the fulfilling branch is
 * located" (relevant for regional ops/commission reporting), not where the
 * customer happened to be.
 */
export async function getOrdersByRegion(range: { from: Date; to: Date }) {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    select: {
      totalAmount: true,
      branch: { select: { region: { select: { id: true, nameEn: true } } } },
    },
  });

  const byRegion = new Map<string, { regionName: string; orderCount: number; gmv: number }>();
  for (const order of orders) {
    const region = order.branch.region;
    const existing = byRegion.get(region.id) ?? {
      regionName: region.nameEn,
      orderCount: 0,
      gmv: 0,
    };
    existing.orderCount += 1;
    existing.gmv += order.totalAmount;
    byRegion.set(region.id, existing);
  }

  return Array.from(byRegion.entries()).map(([regionId, stats]) => ({ regionId, ...stats }));
}

/** Orders over time, bucketed by day, for a simple time-series chart. */
export async function getOrdersOverTime(range: { from: Date; to: Date }) {
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: range.from, lte: range.to } },
    select: { createdAt: true, totalAmount: true, status: true },
  });

  const byDay = new Map<string, { orderCount: number; gmv: number; cancelledCount: number }>();
  for (const order of orders) {
    const dayKey = order.createdAt.toISOString().slice(0, 10);
    const existing = byDay.get(dayKey) ?? { orderCount: 0, gmv: 0, cancelledCount: 0 };
    existing.orderCount += 1;
    existing.gmv += order.totalAmount;
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      existing.cancelledCount += 1;
    }
    byDay.set(dayKey, existing);
  }

  return Array.from(byDay.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
