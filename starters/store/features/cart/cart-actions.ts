"use server";

import { updateTag } from "next/cache";
import { cookies } from "next/headers";
import { parseCart } from "./cart-queries";

export async function addToCart(slug: string) {
  const cookieStore = await cookies();
  const cart = parseCart(cookieStore.get("cart")?.value);
  const existing = cart.find((item) => item.slug === slug);

  const updated = existing
    ? cart.map((item) =>
        item.slug === slug ? { ...item, quantity: item.quantity + 1 } : item,
      )
    : [...cart, { slug, quantity: 1 }];

  cookieStore.set("cart", JSON.stringify(updated));
  updateTag("cart");
}

export async function removeFromCart(slug: string) {
  const cookieStore = await cookies();
  const cart = parseCart(cookieStore.get("cart")?.value);
  const updated = cart.filter((item) => item.slug !== slug);

  cookieStore.set("cart", JSON.stringify(updated));
  updateTag("cart");
}
