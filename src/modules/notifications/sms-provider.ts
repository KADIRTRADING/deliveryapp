import "server-only";
import { env, assertProductionCredentials } from "@/lib/env";

/**
 * SmsProvider abstraction — mirrors the PaymentProvider/StorageProvider/MapProvider
 * pattern used throughout this codebase: define the interface first, then swap
 * concrete implementations based on environment configuration. This keeps SMS
 * delivery (used for phone verification OTPs) decoupled from any single vendor,
 * and lets Telegram/email/push channels be added later without touching callers.
 */
export interface SmsProvider {
  sendSms(phone: string, message: string): Promise<void>;
}

/**
 * Development/test adapter — never sends a real SMS. Logs to the server
 * console so developers can read the OTP code during local development.
 * This adapter is intentionally isolated from anything that talks to a real
 * SMS gateway, and is only ever selected when SMS_PROVIDER=console.
 */
class ConsoleSmsProvider implements SmsProvider {
  async sendSms(phone: string, message: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[dev-sms] → ${phone}: ${message}`);
  }
}

/**
 * Eskiz.uz adapter — a widely used Uzbekistan SMS gateway. Implemented
 * against their documented HTTP API. Requires ESKIZ_EMAIL/ESKIZ_PASSWORD in
 * production; see .env.example and README "SMS Integration" section for the
 * exact setup steps (token retrieval, sender ID approval).
 */
class EskizSmsProvider implements SmsProvider {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }
    const res = await fetch("https://notify.eskiz.uz/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.ESKIZ_EMAIL, password: env.ESKIZ_PASSWORD }),
    });
    if (!res.ok) {
      throw new Error(`Eskiz auth failed with status ${res.status}`);
    }
    const data = (await res.json()) as { data: { token: string } };
    // Eskiz tokens are valid for 30 days; we refresh conservatively every 25.
    this.tokenCache = { token: data.data.token, expiresAt: Date.now() + 25 * 24 * 60 * 60 * 1000 };
    return this.tokenCache.token;
  }

  async sendSms(phone: string, message: string): Promise<void> {
    const token = await this.getToken();
    const res = await fetch("https://notify.eskiz.uz/api/message/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mobile_phone: phone.replace("+", ""),
        message,
        from: "4546",
      }),
    });
    if (!res.ok) {
      throw new Error(`Eskiz send failed with status ${res.status}`);
    }
  }
}

let cachedProvider: SmsProvider | null = null;

export function getSmsProvider(): SmsProvider {
  if (cachedProvider) return cachedProvider;

  if (env.SMS_PROVIDER === "eskiz") {
    assertProductionCredentials("Eskiz SMS", [env.ESKIZ_EMAIL, env.ESKIZ_PASSWORD]);
    cachedProvider = new EskizSmsProvider();
  } else {
    cachedProvider = new ConsoleSmsProvider();
  }
  return cachedProvider;
}
