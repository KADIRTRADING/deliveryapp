import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

/**
 * Reviews. Per "Only eligible customers with completed orders can review"
 * and "Prevent duplicates where appropriate": a review requires a DELIVERED
 * order belonging to the reviewing customer, and Review.orderId is
 * @unique in the schema, so the database itself enforces "one review per
 * order" even under a race between two concurrent requests.
 *
 * Creating a review also updates the restaurant's denormalized
 * ratingAvg/ratingCount (used by restaurant discovery's sort-by-rating and
 * the search minRating filter) inside the same transaction, so those
 * aggregates can never drift out of sync with the underlying Review rows.
 */
export async function createReview(
  userId: string,
  input: { orderId: string; rating: number; comment?: string | null },
) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId },
  });
  if (!order) {
    throw ApiError.notFound("Order not found");
  }
  if (order.status !== "DELIVERED") {
    throw ApiError.conflict("You can only review orders that have been delivered.");
  }

  const existing = await prisma.review.findUnique({ where: { orderId: input.orderId } });
  if (existing) {
    throw ApiError.conflict("You have already reviewed this order.");
  }

  return prisma.$transaction(async (tx) => {
    const review = await tx.review.create({
      data: {
        orderId: input.orderId,
        userId,
        restaurantId: order.restaurantId,
        rating: input.rating,
        comment: input.comment ?? null,
      },
    });

    const aggregate = await tx.review.aggregate({
      where: { restaurantId: order.restaurantId },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await tx.restaurant.update({
      where: { id: order.restaurantId },
      data: {
        ratingAvg: aggregate._avg.rating ?? 0,
        ratingCount: aggregate._count.rating,
      },
    });

    return review;
  });
}

export async function listRestaurantReviews(
  restaurantId: string,
  opts?: { page?: number; pageSize?: number },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 20;

  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where: { restaurantId },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.review.count({ where: { restaurantId } }),
  ]);

  return { items, total, page, pageSize };
}

/** Whether the customer has a delivered, not-yet-reviewed order for this restaurant. */
export async function getReviewEligibility(userId: string, restaurantId: string) {
  const eligibleOrders = await prisma.order.findMany({
    where: { userId, restaurantId, status: "DELIVERED", review: null },
    select: { id: true, orderNumber: true, deliveredAt: true },
    orderBy: { deliveredAt: "desc" },
  });
  return { eligibleOrders };
}
