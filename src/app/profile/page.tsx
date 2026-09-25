"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { Card, LoadingBlock, PrimaryButton, SecondaryButton } from "@/components/ui";

export default function ProfilePage() {
  const t = useTranslations("auth");
  const tNav = useTranslations("nav");
  const router = useRouter();
  const { user, isLoading, setUser } = useSession();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push("/login");
    }
  }, [isLoading, user, router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await api.post("/api/auth/logout");
    } finally {
      setUser(null);
      router.push("/");
    }
  }

  if (isLoading || !user) {
    return <LoadingBlock />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-ink-900">
        {user.firstName} {user.lastName ?? ""}
      </h1>

      <Card className="flex flex-col gap-2 text-sm text-ink-700">
        <div className="flex justify-between">
          <span className="text-ink-400">Phone</span>
          <span>{user.phone}</span>
        </div>
        {user.email && (
          <div className="flex justify-between">
            <span className="text-ink-400">Email</span>
            <span>{user.email}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-ink-400">Roles</span>
          <span>{user.roles.join(", ")}</span>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/addresses">
          <SecondaryButton type="button">{tNav("addresses")}</SecondaryButton>
        </Link>
        <Link href="/orders">
          <SecondaryButton type="button">{tNav("orders")}</SecondaryButton>
        </Link>
        <PrimaryButton type="button" onClick={handleLogout} loading={loggingOut}>
          {t("logout")}
        </PrimaryButton>
      </div>
    </main>
  );
}
