import Link from "next/link";
import { getProducts } from "@/features/products/products-queries";

export async function ProductGrid() {
  const products = await getProducts();

  return (
    <ul className="mt-8 grid grid-cols-2 gap-4">
      {products.map((product) => (
        <li key={product.slug}>
          <Link
            href={`/products/${product.slug}`}
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

export function ProductGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div aria-hidden className="mt-8 grid grid-cols-2 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col rounded-lg border border-foreground/10 p-4"
        >
          <div className="flex h-6 items-center">
            <div className="h-4 w-20 animate-pulse rounded bg-foreground/10" />
          </div>
          <div className="mt-1 flex-1">
            <div className="flex h-5 items-center">
              <div className="h-3.5 w-full animate-pulse rounded bg-foreground/10" />
            </div>
            <div className="flex h-5 items-center">
              <div className="h-3.5 w-4/5 animate-pulse rounded bg-foreground/10" />
            </div>
          </div>
          <div className="mt-3 flex h-5 items-center">
            <div className="h-3.5 w-10 animate-pulse rounded bg-foreground/10" />
          </div>
        </div>
      ))}
    </div>
  );
}
