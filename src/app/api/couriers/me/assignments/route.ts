import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { listMyAssignments } from "@/modules/couriers/couriers.service";
import { handleApiError } from "@/lib/api-error";
import { z } from "zod";

const querySchema = z.object({
  activeOnly: z.coerce.boolean().optional(),
});

/** GET /api/couriers/me/assignments — the authenticated courier's assignments. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireRole("COURIER");
    const { activeOnly } = querySchema.parse({
      activeOnly: req.nextUrl.searchParams.get("activeOnly") ?? undefined,
    });

    const assignments = await listMyAssignments(session, { activeOnly });
    return NextResponse.json({ assignments }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
