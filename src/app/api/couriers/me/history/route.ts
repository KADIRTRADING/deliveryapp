import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listCourierHistory } from "@/modules/couriers/couriers.service";
import { handleApiError } from "@/lib/api-error";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/couriers/me/history — the authenticated courier's completed/closed assignments. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole("COURIER");
    const { page, pageSize } = querySchema.parse({
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });

    const result = await listCourierHistory(session, { page, pageSize });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
