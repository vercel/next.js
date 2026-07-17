"use client";

import { use } from "react";
import { useCart } from "./cart-provider";

export function CartBadge() {
  const { countPromise, optimisticDelta } = useCart();
  const count = use(countPromise) + optimisticDelta;
  return <span>{count}</span>;
}

export function CartBadgeSkeleton() {
  return <span aria-hidden>…</span>;
}
