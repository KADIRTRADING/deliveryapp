/**
 * Search text normalization for Uzbek, Russian, and English content.
 *
 * This is intentionally NOT a full linguistic stemmer/analyzer — it is a
 * pragmatic normalization pass that makes search resilient to the specific
 * variance that matters most for Uzbek/Russian/English restaurant and food
 * names:
 *
 * 1. Case folding (Unicode-aware, so Cyrillic and Latin both fold correctly).
 * 2. Diacritic/accent stripping via Unicode NFKD decomposition, so "café"
 *    and "cafe" match.
 * 3. Uzbek Latin apostrophe-variant collapsing: Uzbek Latin orthography uses
 *    a modifier letter (ʻ, U+02BB) or a typographic apostrophe (', U+2019)
 *    for the tutuq belgisi in words like "oʻsh" / "o'sh" / "osh", and typing
 *    conventions vary wildly (straight quote, curly quote, backtick, or the
 *    letter omitted entirely). We strip all apostrophe-like characters
 *    rather than trying to enumerate every input method.
 * 4. Whitespace collapsing.
 *
 * The normalized output is stored in each searchable record's `searchText`
 * column (see schema.prisma) as the concatenation of all three locale
 * variants of its name/description, and is also applied to the incoming
 * search query before matching — so normalization only needs to be
 * correct, not identical, on both sides for a match to succeed.
 */

const APOSTROPHE_LIKE = /[\u02BB\u02BC\u2018\u2019\u0060\u00B4']/g;

export function normalizeSearchText(input: string): string {
  return (
    input
      .normalize("NFKD")
      // Strip combining diacritical marks left behind by NFKD decomposition
      // (e.g. "é" -> "e" + U+0301 combining acute accent -> strip the mark).
      .replace(/[\u0300-\u036f]/g, "")
      .replace(APOSTROPHE_LIKE, "")
      .toLocaleLowerCase("en-US")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Build the denormalized searchText blob stored alongside a record. */
export function buildSearchText(...parts: Array<string | null | undefined>): string {
  return normalizeSearchText(parts.filter((p): p is string => Boolean(p)).join(" "));
}
