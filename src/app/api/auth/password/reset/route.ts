import { NextRequest, NextResponse } from "next/server";
import { resetPasswordSchema } from "@/modules/auth/schemas";
import { resetPassword } from "@/modules/auth/auth.service";
import { handleApiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = resetPasswordSchema.parse(body);

    await resetPassword(input.token, input.newPassword);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
