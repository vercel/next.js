import { Suspense } from "react";
import {
  CartItems,
  CartItemsSkeleton,
} from "@/features/cart/components/cart-items";

export default function CartPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Cart</h1>
      <Suspense fallback={<CartItemsSkeleton />}>
        <CartItems />
      </Suspense>
    </>
  );
}
