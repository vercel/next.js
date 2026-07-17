"use client";

import {
  createContext,
  useContext,
  useOptimistic,
  useTransition,
  type ReactNode,
} from "react";
import { addToCart } from "@/features/cart/cart-actions";

type CartContextValue = {
  countPromise: Promise<number>;
  optimisticDelta: number;
  addItem: (slug: string) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  countPromise,
  children,
}: {
  countPromise: Promise<number>;
  children: ReactNode;
}) {
  const [optimisticDelta, addOptimisticDelta] = useOptimistic(
    0,
    (delta, added: number) => delta + added,
  );
  const [, startTransition] = useTransition();

  function addItem(slug: string) {
    startTransition(async () => {
      addOptimisticDelta(1);
      await addToCart(slug);
    });
  }

  return (
    <CartContext.Provider value={{ countPromise, optimisticDelta, addItem }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return cart;
}
