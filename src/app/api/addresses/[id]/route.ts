import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { addressUpdateSchema } from "@/modules/locations/schemas";
import { getAddress, updateAddress, deleteAddress } from "@/modules/locations/addresses.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** GET /api/addresses/:id — fetch a single address owned by the authenticated user. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const address = await getAddress(session.user.id, id);
    return NextResponse.json({ address }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** PATCH /api/addresses/:id — update an address owned by the authenticated user. */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    const body = await req.json();
    const input = addressUpdateSchema.parse(body);

    const address = await updateAddress(session.user.id, id, input);
    return NextResponse.json({ address }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/addresses/:id — soft-delete an address owned by the authenticated user. */
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = await requireAuth();
    const { id } = await params;
    await deleteAddress(session.user.id, id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
