"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiRequestError, ensureCsrfCookie } from "@/lib/api-client";
import type { PublicUser } from "@/lib/api-types";

interface SessionContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Client-side "who am I" cache, backed by GET /api/auth/me. This never
 * substitutes for server-side authorization (every protected route handler
 * still calls requireAuth() itself, per src/modules/auth/rbac.ts) — it only
 * drives client UI state (showing the right nav links, redirecting signed-
 * out users away from pages that need a session, etc).
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      await ensureCsrfCookie();
      const data = await api.get<{ user: PublicUser }>("/api/auth/me");
      setUser(data.user);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setUser(null);
      } else {
        setUser(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Only ever run once per mount — subsequent refreshes are triggered
    // explicitly by login/register/logout actions, not polled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(() => ({ user, isLoading, refresh, setUser }), [user, isLoading, refresh]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return ctx;
}
