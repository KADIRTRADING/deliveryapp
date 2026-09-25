import "server-only";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

const ticketInclude = {
  messages: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
  },
  order: { select: { id: true, orderNumber: true } },
  user: { select: { id: true, phone: true, firstName: true, lastName: true } },
} as const;

/** Customer-initiated support ticket creation, optionally linked to a specific order. */
export async function createSupportTicket(
  userId: string,
  input: { subject: string; orderId?: string; body: string },
) {
  if (input.orderId) {
    const order = await prisma.order.findFirst({ where: { id: input.orderId, userId } });
    if (!order) {
      throw ApiError.badRequest("The referenced order was not found on your account.");
    }
  }

  return prisma.supportTicket.create({
    data: {
      userId,
      subject: input.subject,
      orderId: input.orderId ?? null,
      messages: { create: [{ authorUserId: userId, body: input.body }] },
    },
    include: ticketInclude,
  });
}

export async function listMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    include: ticketInclude,
    orderBy: { updatedAt: "desc" },
  });
}

export async function getTicketForCustomer(userId: string, ticketId: string) {
  const ticket = await prisma.supportTicket.findFirst({
    where: { id: ticketId, userId },
    include: ticketInclude,
  });
  if (!ticket) {
    throw ApiError.notFound("Support ticket not found");
  }
  return ticket;
}

/** Add a message to a ticket — usable by the ticket owner or by SUPPORT/ADMIN staff. */
export async function addTicketMessage(ticketId: string, authorUserId: string, body: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw ApiError.notFound("Support ticket not found");
  }

  await prisma.$transaction([
    prisma.supportTicketMessage.create({ data: { ticketId, authorUserId, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { updatedAt: new Date() } }),
  ]);

  return prisma.supportTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
}

// --- Admin/support-side ------------------------------------------------------

export async function listAllTickets(opts: {
  status?: SupportTicketStatus;
  page: number;
  pageSize: number;
}) {
  const where = opts.status ? { status: opts.status } : {};
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: { updatedAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return { items, total, page: opts.page, pageSize: opts.pageSize };
}

export async function getTicketForStaff(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: ticketInclude,
  });
  if (!ticket) {
    throw ApiError.notFound("Support ticket not found");
  }
  return ticket;
}

export async function updateTicket(
  ticketId: string,
  input: { status?: SupportTicketStatus; priority?: SupportTicketPriority },
) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    throw ApiError.notFound("Support ticket not found");
  }
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: input.status, priority: input.priority },
    include: ticketInclude,
  });
}
