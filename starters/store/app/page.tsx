import { Suspense } from "react";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/features/products/components/product-grid";

export default function HomePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Products</h1>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid />
      </Suspense>
    </>
  );
}
