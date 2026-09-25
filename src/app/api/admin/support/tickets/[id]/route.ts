import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { updateTicket } from "@/modules/support/support.service";
import { updateSupportTicketSchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";
import { writeAuditLog } from "@/modules/admin/audit-log.service";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PATCH /api/admin/support/tickets/:id — update a ticket's status/priority. SUPPORT/ADMIN only. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("SUPPORT", "ADMIN", "SUPER_ADMIN");
    const { id } = await params;
    const body = await req.json();
    const input = updateSupportTicketSchema.parse(body);

    const ticket = await updateTicket(id, input);

    await writeAuditLog({
      actorUserId: session.user.id,
      action: "SUPPORT_TICKET_UPDATED",
      entityType: "SupportTicket",
      entityId: id,
      metadata: input,
    });

    return NextResponse.json({ ticket }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
