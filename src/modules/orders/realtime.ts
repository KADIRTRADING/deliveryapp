import "server-only";
import Redis from "ioredis";
import { env } from "@/lib/env";
import type { OrderStatus } from "@prisma/client";

/**
 * Realtime order-status fan-out via Redis pub/sub.
 *
 * Per "Customer should receive live status updates": whenever an order's
 * status changes (see orders.service.ts's `advanceOrderStatus`), we publish
 * an event on a per-order Redis channel. Any open SSE connection for that
 * order (see /api/orders/[id]/stream) is subscribed to the same channel and
 * forwards the event to the connected client immediately.
 *
 * Why Redis pub/sub rather than an in-process EventEmitter: Next.js route
 * handlers may run across multiple server instances/processes in
 * production (this is explicitly why Redis exists in this stack's
 * architecture — see docker-compose.yml). An in-process emitter would only
 * reach clients connected to the same instance that happened to process the
 * status-changing request, silently missing everyone else.
 *
 * A dedicated ioredis connection (separate from the shared `redis` client
 * in src/lib/redis.ts) is required here: once a connection issues
 * SUBSCRIBE, ioredis puts it into subscriber mode and it can no longer run
 * ordinary commands, so publishers and subscribers must not share a client.
 */

export interface OrderStatusEvent {
  orderId: string;
  status: OrderStatus;
  createdAt: string;
}

function orderChannel(orderId: string): string {
  return `order-status:${orderId}`;
}

let publisher: Redis | null = null;
function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
    publisher.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[realtime] publisher connection error:", err.message);
    });
  }
  return publisher;
}

/**
 * Publish a status-change event. Best-effort: a Redis outage must never
 * fail the underlying status transition (which has already been committed
 * to Postgres, the source of truth) — realtime delivery degrading to
 * "customer has to refresh/poll" is an acceptable degradation, silently
 * losing the status transition itself is not.
 */
export async function publishOrderStatusEvent(event: OrderStatusEvent): Promise<void> {
  try {
    await getPublisher().publish(orderChannel(event.orderId), JSON.stringify(event));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[realtime] failed to publish order status event:", err);
  }
}

/**
 * Subscribe to status-change events for one order. Returns an unsubscribe
 * function that MUST be called when the caller (an SSE connection) closes,
 * to avoid leaking Redis subscriber connections.
 */
export function subscribeToOrderStatus(
  orderId: string,
  onEvent: (event: OrderStatusEvent) => void,
): () => void {
  const subscriber = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2 });
  const channel = orderChannel(orderId);

  subscriber.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("[realtime] subscriber connection error:", err.message);
  });

  subscriber.subscribe(channel).catch((err) => {
    // eslint-disable-next-line no-console
    console.error("[realtime] failed to subscribe:", err);
  });

  subscriber.on("message", (receivedChannel, message) => {
    if (receivedChannel !== channel) return;
    try {
      onEvent(JSON.parse(message) as OrderStatusEvent);
    } catch {
      // Malformed message — ignore rather than crash the connection.
    }
  });

  return () => {
    subscriber.unsubscribe(channel).catch(() => undefined);
    subscriber.disconnect();
  };
}
