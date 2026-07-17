import Link from "next/link";
import { Suspense } from "react";
import {
  ProductGrid,
  ProductGridSkeleton,
} from "@/features/products/components/product-grid";
import { SearchBox } from "@/features/products/components/search-box";

const popularSearches = ["mug", "shirt", "sticker"];

export default function HomePage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Products</h1>
      <div className="mt-4 flex flex-col gap-3">
        <SearchBox />
        <div className="flex gap-2">
          {popularSearches.map((term) => (
            <Link
              key={term}
              href={`/search?q=${term}`}
              prefetch
              className="rounded-full border border-foreground/20 px-3 py-1 text-xs text-foreground/70 hover:bg-foreground/5"
            >
              {term}
            </Link>
          ))}
        </div>
      </div>
      <Suspense fallback={<ProductGridSkeleton />}>
        <ProductGrid />
      </Suspense>
    </>
  );
}
