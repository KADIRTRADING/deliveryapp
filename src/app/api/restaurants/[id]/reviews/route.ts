import { NextRequest, NextResponse } from "next/server";
import { listRestaurantReviews } from "@/modules/reviews/reviews.service";
import { handleApiError } from "@/lib/api-error";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /api/restaurants/:id/reviews — public list of a restaurant's reviews. */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { page, pageSize } = querySchema.parse({
      page: req.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: req.nextUrl.searchParams.get("pageSize") ?? undefined,
    });

    const result = await listRestaurantReviews(id, { page, pageSize });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
