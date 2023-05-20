import {
  getProduct,
  getProducts,
  GetProduct,
} from '#/lib/page-directory/get-products'
import { Product } from '#/ui/page-directory/product'
import { Reviews } from '#/ui/page-directory/reviews'
import { SimilarProducts } from '#/ui/page-directory/similar-products'
import { GetStaticProps, GetStaticPaths, InferGetStaticPropsType } from 'next'

// ====================
// 1. Static Data (SSG)
// ====================

// Provide a list of products to pre-render at build time
export const getStaticPaths: GetStaticPaths = async () => {
  const products = await getProducts()

  const productIds = products
    .slice(0, 3) // Only pre-render our "most popular" products
    .map((product) => product.id) // ["1", "2", "3"]

  return {
    paths: productIds.map((id) => ({ params: { id } })), // [{ params: { id: "1" } }, ...]

    // Incremental Static Regeneration:
    // - Generate the rest of our product catalogue at runtime, when they are visited
    // - Balance between faster builds and caching more ahead of time
    // ["4", "5", "..."]
    fallback: 'blocking',
  }
}

// Fetch necessary data for each product when pre-rendered or revalidated

export const getStaticProps: GetStaticProps<{ product: GetProduct }> = async (
  context
) => {
  const id = context.params?.id as string
  const product = await getProduct(id)

  return {
    props: {
      product,
    },

    // Revalidate pages in the background without having to rebuild the entire site

    // Time based revalidation:
    // Periodically revalidate products when a new request comes in
    revalidate: 60, // At most once every 60 seconds

    // On demand revalidation:
    // Triggered by event e.g. CMS update webhook
    // Use an API route e.g. `await res.revalidate('/product/1')`
  }
}

// ===============
// 2. Dynamic Data (SSR)
// ===============

// Server Side Rendering at runtime
// export const getServerSideProps: GetServerSideProps<{
//   product: GetProduct;
// }> = async (context) => {
//   const id = context.params?.id as string;
//   const product = await getProduct(id);

//   return {
//     props: {
//       product,
//     },
//   };
// };

// =======
// 3. Page
// =======

export default function Page({
  product, // passed from getStaticProps or getServerSideProps
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <div className="space-y-8 lg:space-y-14">
      <Product product={product.product} />
      <SimilarProducts products={product.similarProducts} />
      <Reviews reviews={product.reviews} />
    </div>
  )
}
