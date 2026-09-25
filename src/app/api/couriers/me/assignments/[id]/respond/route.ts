import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/modules/auth/rbac";
import { respondToAssignment } from "@/modules/couriers/couriers.service";
import { respondToAssignmentSchema } from "@/modules/couriers/schemas";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/couriers/me/assignments/:id/respond — accept or reject an
 * offered delivery assignment. Accepting also advances the order to
 * COURIER_ASSIGNED.
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireRole("COURIER");
    const { id } = await params;
    const body = await req.json();
    const input = respondToAssignmentSchema.parse(body);

    const assignment = await respondToAssignment(session, id, input.action);

    return NextResponse.json({ assignment }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
