"use server";

import { cookies } from "next/headers";
import { getCart } from "./cart-queries";

export async function addToCart(slug: string) {
  const cart = await getCart();
  const existing = cart.find((item) => item.slug === slug);

  const updated = existing
    ? cart.map((item) =>
        item.slug === slug ? { ...item, quantity: item.quantity + 1 } : item,
      )
    : [...cart, { slug, quantity: 1 }];

  const cookieStore = await cookies();
  cookieStore.set("cart", JSON.stringify(updated));
}

export async function removeFromCart(slug: string) {
  const cart = await getCart();
  const updated = cart.filter((item) => item.slug !== slug);

  const cookieStore = await cookies();
  cookieStore.set("cart", JSON.stringify(updated));
}
