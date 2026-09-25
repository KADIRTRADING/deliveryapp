"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pickLocalized, pickLocalizedDescription, formatUzs } from "@/lib/format";
import { PrimaryButton, SecondaryButton, TextArea } from "@/components/ui";
import type { AppLocale, Product } from "@/lib/api-types";

interface ProductModalProps {
  product: Product;
  onClose: () => void;
  onAdd: (input: {
    productId: string;
    variantId: string | null;
    modifierOptionIds: string[];
    quantity: number;
    notes: string | null;
  }) => Promise<void>;
}

export function ProductModal({ product, onClose, onAdd }: ProductModalProps) {
  const t = useTranslations("restaurant");
  const tCommon = useTranslations("common");
  const locale = useLocale() as AppLocale;

  const defaultVariant = product.variants.find((v) => v.isDefault) ?? product.variants[0] ?? null;
  const [variantId, setVariantId] = useState<string | null>(defaultVariant?.id ?? null);
  const [selectedModifiers, setSelectedModifiers] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const effectiveBase =
    product.discountedPrice != null && product.discountedPrice < product.basePrice
      ? product.discountedPrice
      : product.basePrice;

  const selectedVariant = product.variants.find((v) => v.id === variantId) ?? null;

  const totalPrice = useMemo(() => {
    const variantDelta = selectedVariant?.priceDelta ?? 0;
    const modifiersDelta = product.modifierGroups
      .flatMap((g) => g.options)
      .filter((o) => selectedModifiers.has(o.id))
      .reduce((sum, o) => sum + o.priceDelta, 0);
    return (effectiveBase + variantDelta + modifiersDelta) * quantity;
  }, [effectiveBase, selectedVariant, product.modifierGroups, selectedModifiers, quantity]);

  function toggleModifier(groupId: string, optionId: string, maxSelect: number) {
    setSelectedModifiers((prev) => {
      const next = new Set(prev);
      const group = product.modifierGroups.find((g) => g.id === groupId);
      const groupOptionIds = new Set(group?.options.map((o) => o.id) ?? []);
      const selectedInGroup = [...next].filter((id) => groupOptionIds.has(id));

      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        if (maxSelect === 1) {
          // Single-select group: replace any existing selection in this group.
          for (const id of selectedInGroup) next.delete(id);
        } else if (selectedInGroup.length >= maxSelect) {
          return prev;
        }
        next.add(optionId);
      }
      return next;
    });
  }

  async function handleAdd() {
    setValidationError(null);

    for (const group of product.modifierGroups) {
      const selectedInGroup = group.options.filter((o) => selectedModifiers.has(o.id)).length;
      if (selectedInGroup < group.minSelect) {
        setValidationError(
          t("modifierMinMax", { min: group.minSelect, max: group.maxSelect }) +
            ` — ${pickLocalized(group, locale)}`,
        );
        return;
      }
    }

    if (product.variants.length > 0 && !variantId) {
      setValidationError(t("variantRequired"));
      return;
    }

    setSubmitting(true);
    try {
      await onAdd({
        productId: product.id,
        variantId,
        modifierOptionIds: [...selectedModifiers],
        quantity,
        notes: notes.trim() || null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-t-xl2 bg-white p-6 sm:rounded-xl2"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-ink-900">{pickLocalized(product, locale)}</h2>
            {pickLocalizedDescription(product, locale) && (
              <p className="mt-1 text-sm text-ink-500">
                {pickLocalizedDescription(product, locale)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-ink-400 hover:text-ink-700">
            ✕
          </button>
        </div>

        {product.variants.length > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-ink-700">{t("selectOptions")}</legend>
            {product.variants.map((variant) => (
              <label
                key={variant.id}
                className="flex items-center justify-between rounded-xl2 border border-ink-100 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="variant"
                    checked={variantId === variant.id}
                    onChange={() => setVariantId(variant.id)}
                    disabled={!variant.isAvailable}
                  />
                  {pickLocalized(variant, locale)}
                </span>
                <span className="text-ink-500">
                  {variant.priceDelta > 0
                    ? `+${formatUzs(variant.priceDelta, locale)}`
                    : formatUzs(0, locale)}
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {product.modifierGroups.map((group) => (
          <fieldset key={group.id} className="flex flex-col gap-2">
            <legend className="text-sm font-semibold text-ink-700">
              {pickLocalized(group, locale)} —{" "}
              {t("modifierMinMax", { min: group.minSelect, max: group.maxSelect })}
            </legend>
            {group.options.map((option) => (
              <label
                key={option.id}
                className="flex items-center justify-between rounded-xl2 border border-ink-100 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedModifiers.has(option.id)}
                    onChange={() => toggleModifier(group.id, option.id, group.maxSelect)}
                    disabled={!option.isAvailable}
                  />
                  {pickLocalized(option, locale)}
                </span>
                <span className="text-ink-500">
                  {option.priceDelta > 0
                    ? `+${formatUzs(option.priceDelta, locale)}`
                    : formatUzs(0, locale)}
                </span>
              </label>
            ))}
          </fieldset>
        ))}

        <TextArea
          label={t("notes")}
          placeholder={t("notesPlaceholder")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />

        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-ink-700">{t("quantity")}</span>
          <div className="flex items-center gap-2">
            <SecondaryButton type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              −
            </SecondaryButton>
            <span className="w-6 text-center">{quantity}</span>
            <SecondaryButton type="button" onClick={() => setQuantity((q) => Math.min(50, q + 1))}>
              +
            </SecondaryButton>
          </div>
        </div>

        {validationError && <p className="text-sm text-red-600">{validationError}</p>}

        <PrimaryButton
          type="button"
          onClick={handleAdd}
          loading={submitting}
          className="w-full justify-center"
        >
          {t("addToCart")} · {formatUzs(totalPrice, locale)}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onClose} className="w-full justify-center">
          {tCommon("cancel")}
        </SecondaryButton>
      </div>
    </div>
  );
}
