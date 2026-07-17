"use client";

import { useCart } from "./cart-provider";

export function AddToCartButton({ slug }: { slug: string }) {
  const { addItem } = useCart();

  return (
    <button
      onClick={() => addItem(slug)}
      className="rounded-full border border-foreground/20 px-4 py-1.5 text-sm hover:bg-foreground/5"
    >
      Add to cart
    </button>
  );
}
