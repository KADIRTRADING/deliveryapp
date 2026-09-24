import { NextRequest, NextResponse } from "next/server";
import { searchQuerySchema } from "@/modules/search/schemas";
import { searchPlatform } from "@/modules/search/search.service";
import { handleApiError } from "@/lib/api-error";

/**
 * GET /api/search — global search across restaurants and products/dishes.
 * See src/modules/search/search.service.ts for matching/filtering details.
 */
export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const query = searchQuerySchema.parse({
      q: params.get("q"),
      lat: params.get("lat") ?? undefined,
      lng: params.get("lng") ?? undefined,
      cityId: params.get("cityId") ?? undefined,
      categorySlug: params.get("categorySlug") ?? undefined,
      minPrice: params.get("minPrice") ?? undefined,
      maxPrice: params.get("maxPrice") ?? undefined,
      minRating: params.get("minRating") ?? undefined,
      openNow: params.get("openNow") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });

    const result = await searchPlatform(query);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
