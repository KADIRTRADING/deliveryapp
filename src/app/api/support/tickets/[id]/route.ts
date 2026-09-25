import { NextRequest, NextResponse } from "next/server";
import { requireAuth, hasRole } from "@/modules/auth/rbac";
import { getTicketForCustomer, getTicketForStaff } from "@/modules/support/support.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/support/tickets/:id — the ticket owner may view their own
 * ticket; SUPPORT/ADMIN/SUPER_ADMIN may view any ticket.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    if (hasRole(session, "SUPPORT", "ADMIN", "SUPER_ADMIN")) {
      const ticket = await getTicketForStaff(id);
      return NextResponse.json({ ticket }, { status: 200 });
    }

    const ticket = await getTicketForCustomer(session.user.id, id);
    return NextResponse.json({ ticket }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
