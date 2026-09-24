import "server-only";
import { prisma } from "@/lib/prisma";

export interface AuditLogInput {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

/**
 * Append-only audit trail for sensitive/administrative actions (auth events,
 * restaurant approval, order overrides, promo creation, role changes, etc).
 * Never update or delete rows from this table from application code.
 *
 * Failures here are logged but never thrown — an audit-log write must not be
 * able to fail a business operation (e.g. rolling back an order because the
 * audit insert failed would be worse than a missing audit entry).
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: input.metadata ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[audit-log] failed to write entry:", err);
  }
}
