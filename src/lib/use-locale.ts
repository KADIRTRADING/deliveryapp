"use client";

import { useRouter } from "next/navigation";
import type { AppLocale } from "@/lib/api-types";

/**
 * Switch the active locale by setting the `NEXT_LOCALE` cookie that
 * src/i18n/request.ts reads (see that file's comment: locale is
 * cookie-based, not path-prefixed, and explicit user choice always wins
 * over any other signal). A full router refresh is required because the
 * locale is resolved in a server component (RootLayout) on each request.
 */
export function useLocaleSwitcher() {
  const router = useRouter();

  function setLocale(locale: AppLocale) {
    document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    router.refresh();
  }

  return { setLocale };
}
