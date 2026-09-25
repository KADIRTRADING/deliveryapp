import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Restaurant-scoped analytics for the restaurant dashboard. Per the spec:
 * "today's orders, revenue, average order value, popular products,
 * cancelled orders and sales history," with date-range filtering. Callers
 * (route handlers) MUST authorize restaurant access before calling these —
 * every function here trusts the `restaurantId` it's given completely.
 */

export async function getRestaurantOverview(restaurantId: string, range: { from: Date; to: Date }) {
  const dateFilter = { restaurantId, createdAt: { gte: range.from, lte: range.to } };

  const [totalOrders, completedOrders, cancelledOrders, financials] = await Promise.all([
    prisma.order.count({ where: dateFilter }),
    prisma.order.count({ where: { ...dateFilter, status: "DELIVERED" } }),
    prisma.order.count({ where: { ...dateFilter, status: { in: ["CANCELLED", "REFUNDED"] } } }),
    prisma.order.aggregate({
      where: { ...dateFilter, status: "DELIVERED" },
      _sum: { totalAmount: true, restaurantEarningsAmount: true },
      _avg: { totalAmount: true },
    }),
  ]);

  return {
    totalOrders,
    completedOrders,
    cancelledOrders,
    revenue: financials._sum.restaurantEarningsAmount ?? 0,
    grossSales: financials._sum.totalAmount ?? 0,
    averageOrderValue: Math.round(financials._avg.totalAmount ?? 0),
  };
}

/** Convenience wrapper for "today's orders" — [start of today, now) in server time. */
export async function getTodayOverview(restaurantId: string) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return getRestaurantOverview(restaurantId, { from: startOfToday, to: now });
}

export async function getRestaurantPopularProducts(
  restaurantId: string,
  range: { from: Date; to: Date },
  opts?: { take?: number },
) {
  const grouped = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      order: { restaurantId, createdAt: { gte: range.from, lte: range.to }, status: "DELIVERED" },
      productId: { not: null },
    },
    _sum: { quantity: true, lineTotal: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: opts?.take ?? 10,
  });

  const productIds = grouped.map((g) => g.productId).filter((id): id is string => id !== null);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, nameEn: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  return grouped.map((g) => ({
    product: g.productId ? (productById.get(g.productId) ?? null) : null,
    quantitySold: g._sum.quantity ?? 0,
    revenue: g._sum.lineTotal ?? 0,
  }));
}

/** Daily sales history for a simple chart, matching getOrdersOverTime's shape at the platform level. */
export async function getRestaurantSalesHistory(
  restaurantId: string,
  range: { from: Date; to: Date },
) {
  const orders = await prisma.order.findMany({
    where: { restaurantId, createdAt: { gte: range.from, lte: range.to } },
    select: { createdAt: true, totalAmount: true, restaurantEarningsAmount: true, status: true },
  });

  const byDay = new Map<
    string,
    { orderCount: number; grossSales: number; revenue: number; cancelledCount: number }
  >();
  for (const order of orders) {
    const dayKey = order.createdAt.toISOString().slice(0, 10);
    const existing = byDay.get(dayKey) ?? {
      orderCount: 0,
      grossSales: 0,
      revenue: 0,
      cancelledCount: 0,
    };
    existing.orderCount += 1;
    if (order.status === "DELIVERED") {
      existing.grossSales += order.totalAmount;
      existing.revenue += order.restaurantEarningsAmount;
    }
    if (order.status === "CANCELLED" || order.status === "REFUNDED") {
      existing.cancelledCount += 1;
    }
    byDay.set(dayKey, existing);
  }

  return Array.from(byDay.entries())
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
