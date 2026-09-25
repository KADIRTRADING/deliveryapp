"use client";

import { useTranslations } from "next-intl";

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-5 w-5 animate-spin rounded-full border-2 border-ink-200 border-t-brand-600 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function LoadingBlock() {
  const t = useTranslations("common");
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-ink-400">
      <Spinner />
      <span>{t("loading")}</span>
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col items-start gap-2 rounded-xl2 border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-red-300 px-3 py-1 font-medium hover:bg-red-100"
        >
          {t("retry")}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl2 border border-dashed border-ink-200 bg-white py-16 text-center text-ink-500">
      <p className="text-base font-medium text-ink-700">{title}</p>
      {hint && <p className="max-w-sm text-sm">{hint}</p>}
    </div>
  );
}

export function PrimaryButton({
  children,
  disabled,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl2 bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 ${rest.className ?? ""}`}
    >
      {loading && <Spinner className="h-4 w-4 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl2 border border-ink-200 bg-white px-4 py-2.5 font-semibold text-ink-700 transition hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-60 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function TextInput({
  label,
  error,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-ink-700">{label}</span>}
      <input
        {...rest}
        className={`rounded-xl2 border px-3 py-2 text-ink-900 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
          error ? "border-red-400" : "border-ink-200"
        } ${rest.className ?? ""}`}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function TextArea({
  label,
  error,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-ink-700">{label}</span>}
      <textarea
        {...rest}
        className={`rounded-xl2 border px-3 py-2 text-ink-900 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
          error ? "border-red-400" : "border-ink-200"
        } ${rest.className ?? ""}`}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Select({
  label,
  error,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      {label && <span className="font-medium text-ink-700">{label}</span>}
      <select
        {...rest}
        className={`rounded-xl2 border bg-white px-3 py-2 text-ink-900 outline-none transition focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
          error ? "border-red-400" : "border-ink-200"
        } ${rest.className ?? ""}`}
      >
        {children}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl2 border border-ink-100 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
