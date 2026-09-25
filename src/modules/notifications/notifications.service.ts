import "server-only";
import { prisma } from "@/lib/prisma";
import type { NotificationType } from "@prisma/client";

/**
 * In-app notification persistence. Per "Support in-app notifications for
 * order lifecycle and promotions. Keep architecture extensible for push,
 * SMS, Telegram and email": this module only ever writes/reads the
 * Notification table (in-app). It is deliberately the single choke point
 * through which any future channel fan-out (push/SMS/Telegram/email) would
 * also be triggered, without touching call sites like
 * orders.service.ts — they only ever call `notifyUser`, never construct a
 * Notification row directly.
 *
 * Failures here are logged but never thrown, matching writeAuditLog's
 * discipline: a notification failing to send must never fail the
 * underlying business operation (e.g. an order status transition that
 * already committed to Postgres).
 */
export interface NotifyInput {
  userId: string;
  type: NotificationType;
  titleUz: string;
  titleRu: string;
  titleEn: string;
  bodyUz: string;
  bodyRu: string;
  bodyEn: string;
  data?: Record<string, unknown> | null;
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        titleUz: input.titleUz,
        titleRu: input.titleRu,
        titleEn: input.titleEn,
        bodyUz: input.bodyUz,
        bodyRu: input.bodyRu,
        bodyEn: input.bodyEn,
        data: input.data ?? undefined,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[notifications] failed to create notification:", err);
  }
}

export async function listMyNotifications(
  userId: string,
  opts?: { unreadOnly?: boolean; page?: number; pageSize?: number },
) {
  const page = opts?.page ?? 1;
  const pageSize = opts?.pageSize ?? 30;
  const where = { userId, ...(opts?.unreadOnly ? { readAt: null } : {}) };

  const [items, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  return { items, total, unreadCount, page, pageSize };
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/**
 * Order-status-specific notification copy, per locale. Called from
 * orders.service.ts's advanceOrderStatus/advanceOrderStatusSystem/
 * cancelOrderAsCustomer so every status-changing code path notifies the
 * customer consistently, without duplicating this copy at each call site.
 */
const ORDER_STATUS_COPY: Partial<
  Record<
    string,
    {
      titleUz: string;
      titleRu: string;
      titleEn: string;
      bodyUz: string;
      bodyRu: string;
      bodyEn: string;
    }
  >
> = {
  ACCEPTED: {
    titleUz: "Buyurtmangiz qabul qilindi",
    titleRu: "Ваш заказ принят",
    titleEn: "Your order was accepted",
    bodyUz: "Restoran buyurtmangizni tayyorlashni boshladi.",
    bodyRu: "Ресторан начал готовить ваш заказ.",
    bodyEn: "The restaurant has started preparing your order.",
  },
  PREPARING: {
    titleUz: "Buyurtmangiz tayyorlanmoqda",
    titleRu: "Ваш заказ готовится",
    titleEn: "Your order is being prepared",
    bodyUz: "Taomlaringiz tayyorlanmoqda.",
    bodyRu: "Ваши блюда готовятся.",
    bodyEn: "Your food is being prepared.",
  },
  READY_FOR_PICKUP: {
    titleUz: "Buyurtma olib ketishga tayyor",
    titleRu: "Заказ готов к выдаче",
    titleEn: "Order ready for pickup",
    bodyUz: "Buyurtmangiz kuryer tomonidan olib ketilishini kutmoqda.",
    bodyRu: "Ваш заказ ожидает курьера.",
    bodyEn: "Your order is waiting for a courier.",
  },
  ON_THE_WAY: {
    titleUz: "Buyurtmangiz yo'lda",
    titleRu: "Ваш заказ в пути",
    titleEn: "Your order is on the way",
    bodyUz: "Kuryer buyurtmangizni sizga olib kelmoqda.",
    bodyRu: "Курьер везёт ваш заказ.",
    bodyEn: "A courier is bringing your order to you.",
  },
  DELIVERED: {
    titleUz: "Buyurtma yetkazildi",
    titleRu: "Заказ доставлен",
    titleEn: "Order delivered",
    bodyUz: "Yoqimli ishtaha! Buyurtmangizni baholang.",
    bodyRu: "Приятного аппетита! Оцените ваш заказ.",
    bodyEn: "Enjoy your meal! Please rate your order.",
  },
  CANCELLED: {
    titleUz: "Buyurtma bekor qilindi",
    titleRu: "Заказ отменён",
    titleEn: "Order cancelled",
    bodyUz: "Buyurtmangiz bekor qilindi.",
    bodyRu: "Ваш заказ был отменён.",
    bodyEn: "Your order has been cancelled.",
  },
};

export async function notifyOrderStatusChange(
  userId: string,
  orderId: string,
  orderNumber: string,
  status: string,
): Promise<void> {
  const copy = ORDER_STATUS_COPY[status];
  if (!copy) return; // Not every status is customer-notification-worthy (e.g. internal PAYMENT_PENDING).

  await notifyUser({
    userId,
    type: "ORDER_STATUS",
    titleUz: copy.titleUz,
    titleRu: copy.titleRu,
    titleEn: copy.titleEn,
    bodyUz: `${copy.bodyUz} (#${orderNumber})`,
    bodyRu: `${copy.bodyRu} (#${orderNumber})`,
    bodyEn: `${copy.bodyEn} (#${orderNumber})`,
    data: { orderId, status },
  });
}
