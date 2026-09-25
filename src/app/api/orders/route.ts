import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/modules/auth/rbac";
import { listOrdersForCustomer } from "@/modules/orders/orders.service";
import { handleApiError } from "@/lib/api-error";
import { z } from "zod";

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /api/orders — the authenticated customer's own order history. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth();
    const { page, pageSize } = listQuerySchema.parse({
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });

    const result = await listOrdersForCustomer(session.user.id, { page, pageSize });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
