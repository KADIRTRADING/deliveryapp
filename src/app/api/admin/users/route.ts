import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listUsers } from "@/modules/admin/users.service";
import { listUsersQuerySchema } from "@/modules/admin/schemas";
import { handleApiError } from "@/lib/api-error";

/** GET /api/admin/users — list/search/filter platform users. Admin only. */
export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN", "SUPER_ADMIN");
    const params = req.nextUrl.searchParams;
    const query = listUsersQuerySchema.parse({
      role: params.get("role") ?? undefined,
      status: params.get("status") ?? undefined,
      q: params.get("q") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    const result = await listUsers(query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
