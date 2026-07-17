import { AddToCartButton } from "@/features/cart/components/add-to-cart-button";
import { getProduct } from "@/features/products/products-queries";

export async function ProductDetail({ slug }: { slug: string }) {
  const product = await getProduct(slug);

  return (
    <article>
      <h1 className="text-2xl font-semibold">{product.name}</h1>
      <p className="mt-2 text-lg">${product.price}</p>
      <p className="mt-6 max-w-md leading-7 text-foreground/70">
        {product.description}
      </p>
      <div className="mt-8">
        <AddToCartButton slug={product.slug} />
      </div>
    </article>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div aria-hidden>
      <div className="flex h-8 items-center">
        <div className="h-6 w-40 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-2 flex h-7 items-center">
        <div className="h-5 w-12 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="mt-6 max-w-md">
        <div className="flex h-7 items-center">
          <div className="h-4 w-full animate-pulse rounded bg-foreground/10" />
        </div>
        <div className="flex h-7 items-center">
          <div className="h-4 w-4/5 animate-pulse rounded bg-foreground/10" />
        </div>
      </div>
      <div className="mt-8 h-8.5 w-28 animate-pulse rounded-full bg-foreground/10" />
    </div>
  );
}
