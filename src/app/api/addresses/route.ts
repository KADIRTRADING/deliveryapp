import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { addressInputSchema } from "@/modules/locations/schemas";
import { listAddresses, createAddress } from "@/modules/locations/addresses.service";
import { handleApiError } from "@/lib/api-error";

/** GET /api/addresses — list the authenticated user's saved delivery addresses. */
export async function GET() {
  try {
    const session = await requireAuth();
    const addresses = await listAddresses(session.user.id);
    return NextResponse.json({ addresses }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/addresses — save a new delivery address for the authenticated user. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();
    const input = addressInputSchema.parse(body);

    const address = await createAddress(session.user.id, input);
    return NextResponse.json({ address }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
