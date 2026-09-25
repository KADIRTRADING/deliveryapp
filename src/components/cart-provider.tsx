"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api-client";
import { useSession } from "@/components/session-provider";
import type { Cart } from "@/lib/api-types";

interface CartContextValue {
  /** All of the current user's non-empty carts (one per restaurant). */
  carts: Cart[];
  totalItemCount: number;
  isLoading: boolean;
  refreshCarts: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Lightweight global cart-badge state, backed by GET /api/cart (list all of
 * the user's open carts). Individual restaurant pages/cart pages still
 * fetch and mutate a specific restaurant's cart directly via
 * /api/cart/:restaurantId — this provider exists only so the header's cart
 * icon can show an accurate total count anywhere in the app without every
 * page having to know about every other page's cart mutations.
 */
export function CartProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [carts, setCarts] = useState<Cart[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCarts = useCallback(async () => {
    if (!user) {
      setCarts([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await api.get<{ carts: Cart[] }>("/api/cart");
      setCarts(data.carts);
    } catch {
      setCarts([]);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refreshCarts();
  }, [refreshCarts]);

  const totalItemCount = useMemo(
    () => carts.reduce((sum, cart) => sum + cart.items.reduce((s, i) => s + i.quantity, 0), 0),
    [carts],
  );

  const value = useMemo(
    () => ({ carts, totalItemCount, isLoading, refreshCarts }),
    [carts, totalItemCount, isLoading, refreshCarts],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCartBadge(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCartBadge must be used within a CartProvider");
  }
  return ctx;
}
