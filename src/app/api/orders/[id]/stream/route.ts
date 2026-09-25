import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/modules/auth/rbac";
import { requireRestaurantAccess } from "@/modules/restaurants/access";
import { isAdmin } from "@/modules/auth/rbac";
import { subscribeToOrderStatus } from "@/modules/orders/realtime";
import { ApiError, handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Route handlers that stream indefinitely must opt out of static rendering
// and any response caching — this is a long-lived connection, not a
// cacheable resource.
export const dynamic = "force-dynamic";

/**
 * GET /api/orders/:id/stream — Server-Sent Events stream of live order
 * status updates, per "Customer should receive live status updates."
 *
 * SSE (rather than a raw WebSocket) is used because: it works over plain
 * HTTP/1.1 (no upgrade handshake required, so it works unmodified through
 * every reverse proxy/load balancer this platform might sit behind), the
 * browser's native EventSource API handles automatic reconnection for us,
 * and Next.js Route Handlers can return a ReadableStream directly without
 * any additional WebSocket server infrastructure — a meaningfully smaller
 * amount of production surface area for a feature that is inherently
 * one-directional (server -> client status pushes).
 *
 * Authorization: the requester must either be the customer who placed the
 * order, or have restaurant access to the order's restaurant (owner/staff/
 * admin) — the same two audiences allowed to read the order at all.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, restaurantId: true, status: true },
    });
    if (!order) {
      throw ApiError.notFound("Order not found");
    }

    const isOwningCustomer = order.userId === session.user.id;
    if (!isOwningCustomer && !isAdmin(session)) {
      // Throws ApiError.forbidden if the requester has no restaurant access either.
      await requireRestaurantAccess(session, order.restaurantId);
    }

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        // Send the current status immediately so the client has a value to
        // render before the first change event ever arrives.
        controller.enqueue(
          encoder.encode(
            `event: status\ndata: ${JSON.stringify({ orderId: order.id, status: order.status })}\n\n`,
          ),
        );

        unsubscribe = subscribeToOrderStatus(order.id, (event) => {
          controller.enqueue(encoder.encode(`event: status\ndata: ${JSON.stringify(event)}\n\n`));
          if (
            event.status === "DELIVERED" ||
            event.status === "CANCELLED" ||
            event.status === "REFUNDED"
          ) {
            controller.close();
          }
        });

        // Periodic comment-only "ping" so intermediary proxies/load
        // balancers don't time out an apparently-idle long-lived
        // connection.
        heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15000);
      },
      cancel() {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
