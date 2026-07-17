import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";

export type CartItem = {
  slug: string;
  quantity: number;
};

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export const getCart = cache(async () => {
  await delay();
  const cookieStore = await cookies();
  const value = cookieStore.get("cart")?.value;
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is CartItem =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as CartItem).slug === "string" &&
        typeof (item as CartItem).quantity === "number",
    );
  } catch {
    return [];
  }
});

export const getCartCount = cache(async () => {
  const cart = await getCart();
  return cart.reduce((total, item) => total + item.quantity, 0);
});
