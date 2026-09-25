"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { api, ApiRequestError, ensureCsrfCookie } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import {
  ErrorBanner,
  LoadingBlock,
  PrimaryButton,
  Select,
  TextArea,
  TextInput,
} from "@/components/ui";
import type { Address, City, District, Region } from "@/lib/api-types";

export default function NewAddressPage() {
  const t = useTranslations("address");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  const [regions, setRegions] = useState<Region[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);

  const [label, setLabel] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("+998");
  const [regionId, setRegionId] = useState("");
  const [cityId, setCityId] = useState("");
  const [districtId, setDistrictId] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [building, setBuilding] = useState("");
  const [apartment, setApartment] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [isDefault, setIsDefault] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!sessionLoading && !user) {
      router.push("/login");
    }
  }, [sessionLoading, user, router]);

  useEffect(() => {
    void api
      .get<{ regions: Region[] }>("/api/locations/regions")
      .then((d) => setRegions(d.regions));
  }, []);

  useEffect(() => {
    if (!regionId) {
      setCities([]);
      setCityId("");
      return;
    }
    void api
      .get<{ cities: City[] }>("/api/locations/cities", { regionId })
      .then((d) => setCities(d.cities));
  }, [regionId]);

  useEffect(() => {
    if (!cityId) {
      setDistricts([]);
      setDistrictId("");
      return;
    }
    void api
      .get<{ districts: District[] }>("/api/locations/districts", { cityId })
      .then((d) => setDistricts(d.districts));
  }, [cityId]);

  function useMyLocation() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    try {
      await ensureCsrfCookie();
      await api.post<{ address: Address }>("/api/addresses", {
        label: label || undefined,
        recipientName,
        recipientPhone,
        regionId,
        cityId,
        districtId: districtId || undefined,
        addressLine,
        building: building || undefined,
        apartment: apartment || undefined,
        deliveryInstructions: deliveryInstructions || undefined,
        latitude: Number(latitude),
        longitude: Number(longitude),
        isDefault,
      });
      router.push("/addresses");
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
      setSubmitting(false);
    }
  }

  if (sessionLoading || !user) {
    return <LoadingBlock />;
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-bold text-ink-900">{t("addNew")}</h1>

      {error && <ErrorBanner message={error} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <TextInput label={t("label")} value={label} onChange={(e) => setLabel(e.target.value)} />
        <TextInput
          label={t("recipientName")}
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          required
          error={fieldErrors.recipientName?.[0]}
        />
        <TextInput
          label={t("recipientPhone")}
          type="tel"
          value={recipientPhone}
          onChange={(e) => setRecipientPhone(e.target.value)}
          required
          error={fieldErrors.recipientPhone?.[0]}
        />

        <Select
          label={t("region")}
          value={regionId}
          onChange={(e) => setRegionId(e.target.value)}
          required
        >
          <option value="">{tCommon("required")}</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nameEn}
            </option>
          ))}
        </Select>

        <Select
          label={t("city")}
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          required
          disabled={!regionId}
        >
          <option value="">{regionId ? tCommon("required") : t("selectRegionFirst")}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameEn}
            </option>
          ))}
        </Select>

        {districts.length > 0 && (
          <Select
            label={t("district")}
            value={districtId}
            onChange={(e) => setDistrictId(e.target.value)}
          >
            <option value="">{tCommon("optional")}</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nameEn}
              </option>
            ))}
          </Select>
        )}

        <TextInput
          label={t("addressLine")}
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
          required
          error={fieldErrors.addressLine?.[0]}
        />

        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label={t("building")}
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
          />
          <TextInput
            label={t("apartment")}
            value={apartment}
            onChange={(e) => setApartment(e.target.value)}
          />
        </div>

        <TextArea
          label={t("deliveryInstructions")}
          value={deliveryInstructions}
          onChange={(e) => setDeliveryInstructions(e.target.value)}
          rows={2}
        />

        <div className="flex flex-col gap-2 rounded-xl2 border border-ink-100 bg-ink-50 p-3">
          <p className="text-xs text-ink-500">{t("coordinatesHint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <TextInput
              label={t("latitude")}
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              required
              error={fieldErrors.latitude?.[0]}
            />
            <TextInput
              label={t("longitude")}
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              required
              error={fieldErrors.longitude?.[0]}
            />
          </div>
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="self-start text-sm font-medium text-brand-600 hover:underline disabled:opacity-60"
          >
            {locating ? tCommon("loading") : t("useMyLocation")}
          </button>
        </div>

        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300"
          />
          {t("setDefault")}
        </label>

        <PrimaryButton type="submit" loading={submitting}>
          {tCommon("save")}
        </PrimaryButton>
      </form>
    </main>
  );
}
