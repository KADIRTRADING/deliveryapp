import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listAllTickets } from "@/modules/support/support.service";
import { listSupportTicketsQuerySchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/admin/support/tickets — list all support tickets, optionally filtered by status. SUPPORT/ADMIN only. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("SUPPORT", "ADMIN", "SUPER_ADMIN");
    const params = req.nextUrl.searchParams;
    const query = listSupportTicketsQuerySchema.parse({
      status: params.get("status") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    const result = await listAllTickets(query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
