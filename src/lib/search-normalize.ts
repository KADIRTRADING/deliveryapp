/**
 * Search text normalization for Uzbek, Russian, and English content.
 *
 * This is intentionally NOT a full linguistic stemmer/analyzer — it is a
 * pragmatic normalization pass that makes search resilient to the specific
 * variance that matters most for Uzbek/Russian/English restaurant and food
 * names:
 *
 * 1. Case folding (Unicode-aware, so Cyrillic and Latin both fold correctly).
 * 2. Latin diacritic/accent stripping via an explicit letter map, so "café"
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

/**
 * Explicit Latin-diacritic -> base-letter map, applied AFTER lowercasing.
 *
 * We deliberately do NOT use a blanket Unicode NFKD-decompose-then-strip-
 * combining-marks approach here: NFKD decomposes several Cyrillic letters
 * into a base letter plus a combining mark from the exact same Unicode
 * block used by Latin diacritics (e.g. Russian "й" decomposes to "и" +
 * U+0306 COMBINING BREVE, and "ё" decomposes to "е" + U+0308 COMBINING
 * DIAERESIS — the very mark that also produces Latin "ö"). A generic
 * strip-all-combining-marks pass would silently corrupt Cyrillic text
 * ("узбекский" becoming "узбекскии"), which is worse for search quality
 * than not stripping Latin diacritics at all. An explicit, closed mapping
 * only ever touches the specific Latin letters listed here.
 */
const LATIN_DIACRITIC_MAP: Record<string, string> = {
  à: "a",
  á: "a",
  â: "a",
  ã: "a",
  ä: "a",
  å: "a",
  è: "e",
  é: "e",
  ê: "e",
  ë: "e",
  ì: "i",
  í: "i",
  î: "i",
  ï: "i",
  ò: "o",
  ó: "o",
  ô: "o",
  õ: "o",
  ö: "o",
  ù: "u",
  ú: "u",
  û: "u",
  ü: "u",
  ý: "y",
  ÿ: "y",
  ñ: "n",
  ç: "c",
};
const LATIN_DIACRITIC_PATTERN = new RegExp(`[${Object.keys(LATIN_DIACRITIC_MAP).join("")}]`, "g");

export function normalizeSearchText(input: string): string {
  return input
    .replace(APOSTROPHE_LIKE, "")
    .toLocaleLowerCase("en-US")
    .replace(LATIN_DIACRITIC_PATTERN, (char) => LATIN_DIACRITIC_MAP[char] ?? char)
    .replace(/\s+/g, " ")
    .trim();
}

/** Build the denormalized searchText blob stored alongside a record. */
export function buildSearchText(...parts: Array<string | null | undefined>): string {
  return normalizeSearchText(parts.filter((p): p is string => Boolean(p)).join(" "));
}
