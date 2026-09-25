import type { AppLocale } from "@/lib/api-types";

/**
 * Pick the correct localized field from a record that carries the
 * platform's standard `*Uz` / `*Ru` / `*En` triple (see prisma/schema.prisma's
 * convention comment), falling back through Uzbek -> Russian -> English ->
 * empty string if a specific locale's value is missing/blank.
 */
export function pickLocalized(
  entity: { nameUz?: string | null; nameRu?: string | null; nameEn?: string | null },
  locale: AppLocale,
): string {
  const byLocale: Record<AppLocale, string | null | undefined> = {
    uz: entity.nameUz,
    ru: entity.nameRu,
    en: entity.nameEn,
  };
  return byLocale[locale] || entity.nameUz || entity.nameRu || entity.nameEn || "";
}

export function pickLocalizedDescription(
  entity: {
    descriptionUz?: string | null;
    descriptionRu?: string | null;
    descriptionEn?: string | null;
  },
  locale: AppLocale,
): string {
  const byLocale: Record<AppLocale, string | null | undefined> = {
    uz: entity.descriptionUz,
    ru: entity.descriptionRu,
    en: entity.descriptionEn,
  };
  return (
    byLocale[locale] || entity.descriptionUz || entity.descriptionRu || entity.descriptionEn || ""
  );
}

/** Format a whole-UZS integer amount as "35 000 UZS" (space-grouped, no decimals — UZS has no active subunit). */
export function formatUzs(amount: number, locale: AppLocale = "en"): string {
  const localeTag = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : "en-US";
  const grouped = new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(amount);
  return `${grouped} UZS`;
}

export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
