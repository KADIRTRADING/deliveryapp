import { NextRequest, NextResponse } from "next/server";
import { requireAuth, hasRole } from "@/modules/auth/rbac";
import {
  addTicketMessage,
  getTicketForCustomer,
  getTicketForStaff,
} from "@/modules/support/support.service";
import { addSupportTicketMessageSchema } from "@/modules/admin/schemas";
import { handleApiError, ApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/support/tickets/:id/messages — reply to a ticket. The ticket
 * owner may reply to their own ticket; SUPPORT/ADMIN/SUPER_ADMIN may reply
 * to any ticket.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const input = addSupportTicketMessageSchema.parse(body);

    const isStaff = hasRole(session, "SUPPORT", "ADMIN", "SUPER_ADMIN");
    if (isStaff) {
      await getTicketForStaff(id);
    } else {
      await getTicketForCustomer(session.user.id, id);
    }

    const ticket = await addTicketMessage(id, session.user.id, input.body);
    if (!ticket) {
      throw ApiError.notFound("Support ticket not found");
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
