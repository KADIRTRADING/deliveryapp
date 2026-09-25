"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiRequestError, ensureCsrfCookie } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { PrimaryButton, TextInput, ErrorBanner } from "@/components/ui";
import type { PublicUser } from "@/lib/api-types";

export default function LoginPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { refresh } = useSession();

  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await ensureCsrfCookie();
      await api.post<{ user: PublicUser }>("/api/auth/login", { phone, password });
      await refresh();
      router.push("/");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.status === 401 ? t("invalidCredentials") : err.message);
      } else {
        setError(tCommon("unknownError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold text-ink-900">{t("loginTitle")}</h1>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextInput
          label={t("phoneLabel")}
          type="tel"
          placeholder={t("phonePlaceholder")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          autoComplete="tel"
        />
        <TextInput
          label={t("passwordLabel")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <PrimaryButton type="submit" loading={loading}>
          {t("loginButton")}
        </PrimaryButton>
      </form>

      <p className="text-sm text-ink-500">
        {t("noAccount")}{" "}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          {t("registerLink")}
        </Link>
      </p>
    </main>
  );
}
