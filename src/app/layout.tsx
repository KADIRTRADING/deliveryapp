import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SessionProvider } from "@/components/session-provider";
import { CartProvider } from "@/components/cart-provider";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "DeliveryApp — Food & Delivery in Uzbekistan",
  description:
    "Order food and local delivery across Uzbekistan — fast, reliable, and available in Uzbek, Russian and English.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SessionProvider>
            <CartProvider>
              <AppHeader />
              {children}
            </CartProvider>
          </SessionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
