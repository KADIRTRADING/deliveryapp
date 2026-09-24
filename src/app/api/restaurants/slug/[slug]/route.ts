import { NextRequest, NextResponse } from "next/server";
import { getRestaurantBySlug } from "@/modules/restaurants/restaurants.service";
import { handleApiError } from "@/lib/api-error";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/** GET /api/restaurants/slug/:slug — public restaurant detail page lookup. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { slug } = await params;
    const restaurant = await getRestaurantBySlug(slug);
    return NextResponse.json({ restaurant }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
