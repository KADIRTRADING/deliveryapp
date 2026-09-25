"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api, ApiRequestError, ensureCsrfCookie } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import { useCartBadge } from "@/components/cart-provider";
import {
  Card,
  ErrorBanner,
  LoadingBlock,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from "@/components/ui";
import { formatUzs, pickLocalized } from "@/lib/format";
import type { AppLocale, Address, CartResponse, Order, PaymentMethod } from "@/lib/api-types";

export default function CheckoutPage() {
  const params = useParams<{ restaurantId: string }>();
  const router = useRouter();
  const t = useTranslations("checkout");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;
  const { user, isLoading: sessionLoading } = useSession();
  const { refreshCarts } = useCartBadge();

  const [cartData, setCartData] = useState<CartResponse | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [promoCode, setPromoCode] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cart, addressList] = await Promise.all([
        api.get<CartResponse>(`/api/cart/${params.restaurantId}`),
        api.get<{ addresses: Address[] }>("/api/addresses"),
      ]);
      setCartData(cart);
      setAddresses(addressList.addresses);
      const defaultAddress =
        addressList.addresses.find((a) => a.isDefault) ?? addressList.addresses[0];
      if (defaultAddress) setSelectedAddressId(defaultAddress.id);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load checkout.");
    } finally {
      setLoading(false);
    }
  }, [params.restaurantId]);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) void load();
  }, [sessionLoading, user, router, load]);

  async function handlePlaceOrder() {
    if (!selectedAddressId) return;
    setPlacing(true);
    setError(null);
    try {
      await ensureCsrfCookie();
      const { order } = await api.post<{ order: Order }>(`/api/checkout/${params.restaurantId}`, {
        addressId: selectedAddressId,
        paymentMethod,
        deliveryInstructions: deliveryInstructions || undefined,
        promoCode: promoCode || undefined,
      });
      await refreshCarts();

      if (paymentMethod === "ONLINE") {
        const { payment } = await api.post<{ payment: { redirectUrl: string } }>(
          `/api/payments/orders/${order.id}/initiate`,
        );
        window.location.href = payment.redirectUrl;
        return;
      }

      router.push(`/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : tCommon("unknownError"));
    } finally {
      setPlacing(false);
    }
  }

  if (sessionLoading || loading) return <LoadingBlock />;
  if (error && !cartData)
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBanner message={error} onRetry={load} />
      </div>
    );

  if (!cartData?.cart || cartData.cart.items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <ErrorBanner message={t("cartEmpty")} />
      </main>
    );
  }

  const { pricing } = cartData;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-ink-900">{t("title")}</h1>

      {error && <ErrorBanner message={error} />}

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-ink-900">{t("selectAddress")}</h2>
        {addresses.length === 0 ? (
          <Card>
            <p className="mb-3 text-sm text-ink-500">{t("noAddresses")}</p>
            <Link href="/addresses/new">
              <SecondaryButton type="button">{t("addAddress")}</SecondaryButton>
            </Link>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {addresses.map((address) => (
              <label
                key={address.id}
                className={`flex items-center justify-between rounded-xl2 border p-3 text-sm ${
                  selectedAddressId === address.id
                    ? "border-brand-500 bg-brand-50"
                    : "border-ink-100 bg-white"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="address"
                    checked={selectedAddressId === address.id}
                    onChange={() => setSelectedAddressId(address.id)}
                  />
                  <span>
                    <span className="font-medium">{address.label || address.addressLine}</span>
                    <span className="block text-xs text-ink-400">
                      {address.addressLine}, {address.city.nameEn}
                    </span>
                  </span>
                </span>
              </label>
            ))}
            <Link
              href="/addresses/new"
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              + {t("addAddress")}
            </Link>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold text-ink-900">{t("paymentMethod")}</h2>
        <div className="flex gap-3">
          <label
            className={`flex-1 cursor-pointer rounded-xl2 border p-3 text-center text-sm ${
              paymentMethod === "CASH" ? "border-brand-500 bg-brand-50" : "border-ink-100 bg-white"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              className="sr-only"
              checked={paymentMethod === "CASH"}
              onChange={() => setPaymentMethod("CASH")}
            />
            {t("cash")}
          </label>
          <label
            className={`flex-1 cursor-pointer rounded-xl2 border p-3 text-center text-sm ${
              paymentMethod === "ONLINE"
                ? "border-brand-500 bg-brand-50"
                : "border-ink-100 bg-white"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              className="sr-only"
              checked={paymentMethod === "ONLINE"}
              onChange={() => setPaymentMethod("ONLINE")}
            />
            {t("online")}
          </label>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <TextInput
          label={t("promoCode")}
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
        />
        <TextInput
          label={t("deliveryInstructions")}
          value={deliveryInstructions}
          onChange={(e) => setDeliveryInstructions(e.target.value)}
        />
      </section>

      <section className="flex flex-col gap-2 rounded-xl2 border border-ink-100 bg-white p-4">
        <h2 className="font-semibold text-ink-900">{t("orderSummary")}</h2>
        {pricing.lines.map((line) => (
          <div key={line.cartItemId} className="flex justify-between text-sm text-ink-600">
            <span>
              {line.quantity}× {line.productName}
            </span>
            <span>{formatUzs(line.lineTotal, locale)}</span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t border-ink-100 pt-2 font-bold text-ink-900">
          <span>{t("total")}</span>
          <span>{formatUzs(pricing.subtotalAmount, locale)}</span>
        </div>
        <p className="text-xs text-ink-400">
          Delivery fee, discounts, and the final total are calculated by the server after you place
          the order.
        </p>
      </section>

      <PrimaryButton
        type="button"
        onClick={handlePlaceOrder}
        loading={placing}
        disabled={!selectedAddressId}
        className="w-full justify-center"
      >
        {placing ? t("placingOrder") : t("placeOrder")}
      </PrimaryButton>
    </main>
  );
}
