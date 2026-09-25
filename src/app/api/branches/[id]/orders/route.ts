import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { requireBranchAccess } from "@/modules/restaurants/access";
import { listOrdersForBranch } from "@/modules/orders/orders.service";
import { listBranchOrdersQuerySchema } from "@/modules/orders/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/branches/:id/orders — restaurant dashboard's incoming-orders
 * view for one branch, optionally filtered by status (e.g. status=PENDING
 * for the "needs action" queue). Owner/staff/admin only.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await requireBranchAccess(session, id);

    const query = listBranchOrdersQuerySchema.parse({
      status: req.nextUrl.searchParams.get("status") ?? undefined,
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });

    const result = await listOrdersForBranch(id, query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
