import Link from "next/link";
import { searchProducts } from "@/features/products/products-queries";
import { ProductGridSkeleton } from "./product-grid";

export async function SearchResults({ query }: { query: string }) {
  if (!query) {
    return (
      <p className="mt-8 text-sm text-foreground/70">
        Type a query to search the catalog.
      </p>
    );
  }

  const results = await searchProducts(query);

  if (results.length === 0) {
    return (
      <p className="mt-8 text-sm text-foreground/70">
        No products match “{query}”.
      </p>
    );
  }

  return (
    <ul className="mt-8 grid grid-cols-2 gap-4">
      {results.map((product) => (
        <li key={product.slug}>
          <Link
            href={`/products/${product.slug}`}
            prefetch
            className="flex h-full flex-col rounded-lg border border-foreground/10 p-4 hover:border-foreground/30"
          >
            <span className="font-medium">{product.name}</span>
            <span className="mt-1 flex-1 text-sm text-foreground/70">
              {product.description}
            </span>
            <span className="mt-3 text-sm">${product.price}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export { ProductGridSkeleton as SearchResultsSkeleton };
