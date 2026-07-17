import Link from "next/link";
import { removeFromCart } from "@/features/cart/cart-actions";
import { getCart } from "@/features/cart/cart-queries";
import { getProduct } from "@/features/products/products-queries";

export async function CartItems() {
  const cart = await getCart();

  if (cart.length === 0) {
    return (
      <p className="mt-8 text-sm text-foreground/70">
        Your cart is empty.{" "}
        <Link href="/" className="underline">
          Browse products
        </Link>
      </p>
    );
  }

  const items = await Promise.all(
    cart.map(async (item) => ({
      ...item,
      product: await getProduct(item.slug),
    })),
  );

  const total = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
  );

  return (
    <div className="mt-8">
      <ul className="flex flex-col divide-y divide-foreground/10">
        {items.map((item) => (
          <li key={item.slug} className="flex items-center gap-4 py-3">
            <span className="flex-1">
              {item.product.name} × {item.quantity}
            </span>
            <span className="text-sm">
              ${item.product.price * item.quantity}
            </span>
            <form action={removeFromCart.bind(null, item.slug)}>
              <button className="text-sm text-foreground/50 underline hover:text-foreground">
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-foreground/10 pt-4 font-medium">
        Total: ${total}
      </p>
    </div>
  );
}

export function CartItemsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden className="mt-8">
      <div className="flex flex-col divide-y divide-foreground/10">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex h-12 items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-foreground/10" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-foreground/10" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex h-11 items-start border-t border-foreground/10 pt-4">
        <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
      </div>
    </div>
  );
}
