import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

const orderInclude = {
  items: { include: { modifiers: true } },
  restaurant: {
    select: { id: true, slug: true, nameUz: true, nameRu: true, nameEn: true, logoUrl: true },
  },
  branch: { select: { id: true, name: true, phone: true } },
  statusHistory: { orderBy: { createdAt: "asc" as const } },
} as const;

/**
 * Fetch a single order, scoped to the requesting customer — an ordinary
 * customer may only ever see their own orders. Restaurant staff/admin
 * access to orders they need to fulfill is authorized separately (Phase 5's
 * restaurant dashboard), not through this function.
 */
export async function getOrderForCustomer(userId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, userId },
    include: orderInclude,
  });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  return order;
}

export async function listOrdersForCustomer(
  userId: string,
  opts?: { page?: number; pageSize?: number },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where: { userId } }),
  ]);

  return { items, total, page, pageSize };
}
