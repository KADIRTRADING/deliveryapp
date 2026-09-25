"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import {
  Card,
  EmptyState,
  ErrorBanner,
  LoadingBlock,
  PrimaryButton,
  SecondaryButton,
} from "@/components/ui";
import type { Address } from "@/lib/api-types";

export default function AddressesPage() {
  const t = useTranslations("address");
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<{ addresses: Address[] }>("/api/addresses");
      setAddresses(data.addresses);
    } catch {
      setError("Failed to load addresses.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void load();
    }
  }, [sessionLoading, user, router, load]);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeletingId(id);
    try {
      await api.delete(`/api/addresses/${id}`);
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  if (sessionLoading || loading) {
    return <LoadingBlock />;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-900">{t("title")}</h1>
        <Link href="/addresses/new">
          <PrimaryButton type="button">{t("addNew")}</PrimaryButton>
        </Link>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}

      {addresses.length === 0 ? (
        <EmptyState title={t("noAddresses")} />
      ) : (
        <div className="flex flex-col gap-3">
          {addresses.map((address) => (
            <Card key={address.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink-900">
                  {address.label || address.addressLine}
                </span>
                {address.isDefault && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
                    {t("default")}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-500">
                {address.addressLine}, {address.city.nameEn}
                {address.district ? `, ${address.district.nameEn}` : ""}
              </p>
              <p className="text-sm text-ink-500">
                {address.recipientName} · {address.recipientPhone}
              </p>
              <div className="flex gap-2 pt-1">
                <SecondaryButton
                  type="button"
                  onClick={() => handleDelete(address.id)}
                  disabled={deletingId === address.id}
                >
                  {t("delete")}
                </SecondaryButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
