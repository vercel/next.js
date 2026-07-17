import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cookies } from "next/headers";

export type CartItem = {
  slug: string;
  quantity: number;
};

function delay() {
  return new Promise((resolve) => setTimeout(resolve, 500));
}

export function parseCart(value: string | undefined): CartItem[] {
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
}

export async function getCart() {
  "use cache: private";
  cacheLife("hours");
  cacheTag("cart");

  await delay();
  const cookieStore = await cookies();
  return parseCart(cookieStore.get("cart")?.value);
}

export async function getCartCount() {
  const cart = await getCart();
  return cart.reduce((total, item) => total + item.quantity, 0);
}
