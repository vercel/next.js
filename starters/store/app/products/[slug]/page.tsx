import { Suspense } from "react";
import {
  ProductDetail,
  ProductDetailSkeleton,
} from "@/features/products/components/product-detail";
import { getProduct, getProducts } from "@/features/products/products-queries";

export async function generateStaticParams() {
  const products = await getProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata(props: PageProps<"/products/[slug]">) {
  const { slug } = await props.params;
  const product = await getProduct(slug);
  return { title: product.name };
}

export default function ProductPage({ params }: PageProps<"/products/[slug]">) {
  return (
    <Suspense fallback={<ProductDetailSkeleton />}>
      {params.then(({ slug }) => (
        <ProductDetail slug={slug} />
      ))}
    </Suspense>
  );
}
