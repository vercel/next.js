"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-provider";

export function AddToCartButton({ slug }: { slug: string }) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  function handleClick() {
    addItem(slug);
    setAdded(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setAdded(false), 1500);
  }

  return (
    <button
      onClick={handleClick}
      aria-live="polite"
      className="rounded-full border border-foreground/20 px-4 py-1.5 text-sm hover:bg-foreground/5"
    >
      {added ? "Added ✓" : "Add to cart"}
    </button>
  );
}
