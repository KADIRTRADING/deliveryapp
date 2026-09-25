import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { createSupportTicket, listMyTickets } from "@/modules/support/support.service";
import { createSupportTicketSchema } from "@/modules/support/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/support/tickets — the authenticated user's own support tickets. */
export async function GET() {
  try {
    const session = await requireAuth();
    const tickets = await listMyTickets(session.user.id);
    return NextResponse.json({ tickets }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/support/tickets — open a new support ticket, optionally linked to an order. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = createSupportTicketSchema.parse(body);

    const ticket = await createSupportTicket(session.user.id, input);

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
