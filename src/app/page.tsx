import { getTranslations } from "next-intl/server";

/**
 * Phase 1 placeholder landing page. Restaurant discovery, location
 * selection, and the map UI are built out in Phase 2+ per the implementation
 * order; this route exists now so the app shell, i18n wiring, and layout can
 * be verified end-to-end (build + typecheck + render) at the end of Phase 1.
 */
export default async function HomePage() {
  const t = await getTranslations("home");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-bold text-brand-600">{t("heroTitle")}</h1>
      <p className="max-w-md text-ink-500">{t("heroSubtitle")}</p>
      <div className="mt-4 rounded-xl2 border border-ink-100 bg-white px-6 py-4 text-sm text-ink-400">
        Phase 1 foundation: authentication, RBAC, and core infrastructure are live.
        Restaurant discovery and the map/location UI arrive in Phase 2.
      </div>
    </main>
  );
}
