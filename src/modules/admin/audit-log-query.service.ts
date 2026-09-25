import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * Read side of the audit log — per "view platform analytics and audit
 * logs." The write side (writeAuditLog) lives in audit-log.service.ts and
 * is called from every sensitive action across the codebase; this module
 * only ever reads, filters, and paginates that append-only table.
 */
export async function listAuditLog(opts: {
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
  page: number;
  pageSize: number;
}) {
  const where = {
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.entityId ? { entityId: opts.entityId } : {}),
    ...(opts.actorUserId ? { actorUserId: opts.actorUserId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { id: true, phone: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
      skip: (opts.page - 1) * opts.pageSize,
      take: opts.pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total, page: opts.page, pageSize: opts.pageSize };
}
