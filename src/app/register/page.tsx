"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiRequestError, ensureCsrfCookie } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { PrimaryButton, TextInput, ErrorBanner } from "@/components/ui";
import type { PublicUser } from "@/lib/api-types";

export default function RegisterPage() {
  const t = useTranslations("auth");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { refresh } = useSession();

  const [phone, setPhone] = useState("+998");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      await ensureCsrfCookie();
      await api.post<{ user: PublicUser }>("/api/auth/register", {
        phone,
        password,
        firstName,
        lastName: lastName || undefined,
      });
      await refresh();
      router.push("/");
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        if (err.code === "VALIDATION_ERROR" && err.details) {
          setFieldErrors(err.details as Record<string, string[]>);
        }
      } else {
        setError(tCommon("unknownError"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-12">
      <h1 className="text-2xl font-bold text-ink-900">{t("registerTitle")}</h1>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextInput
          label={t("firstNameLabel")}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          error={fieldErrors.firstName?.[0]}
        />
        <TextInput
          label={t("lastNameLabel")}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          error={fieldErrors.lastName?.[0]}
        />
        <TextInput
          label={t("phoneLabel")}
          type="tel"
          placeholder={t("phonePlaceholder")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          autoComplete="tel"
          error={fieldErrors.phone?.[0]}
        />
        <TextInput
          label={t("passwordLabel")}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          minLength={8}
          error={fieldErrors.password?.[0]}
        />
        <PrimaryButton type="submit" loading={loading}>
          {t("registerButton")}
        </PrimaryButton>
      </form>

      <p className="text-sm text-ink-500">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          {t("loginLink")}
        </Link>
      </p>
    </main>
  );
}
