import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { defaultLocale, isAppLocale } from "@/i18n/config";

/**
 * Resolves the active locale for a given request from the `NEXT_LOCALE`
 * cookie (set when the user explicitly changes language), falling back to
 * Uzbek — the platform's default per the internationalization requirement.
 * This intentionally does not use the Accept-Language header as the primary
 * signal so a user's explicit in-app choice is always respected.
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale = cookieLocale && isAppLocale(cookieLocale) ? cookieLocale : defaultLocale;

  const messages = (await import(`../../messages/${locale}.json`)).default;

  return { locale, messages };
});
