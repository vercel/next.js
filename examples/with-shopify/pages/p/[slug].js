import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getAllProductsWithSlug, getProductAndMoreProducts } from '@/lib/api'
import Layout from '@/components/layout'
import ProductBody from '@/components/product-body'
import Products from '@/components/products'

export default function Index({ shop, pages, product, relatedProducts }) {
  const router = useRouter()

  if (!router.isFallback && !product?.handle) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <Layout shop={shop} pages={pages}>
      <Head>
        <title>
          {product?.title ? `${product.title} | ` : ''}Next.js Ecommerce Example
          with {CMS_NAME}
        </title>
        <meta property="og:image" content={product.image} />
      </Head>

      {router.isFallback ? (
        <h1 className="text-5xl">Loading...</h1>
      ) : (
        <ProductBody product={product} />
      )}
      {relatedProducts.length > 0 && (
        <section className="my-24">
          <h2 className="mb-8 text-5xl leading-tight">You may also like</h2>
          <Products products={relatedProducts} />
        </section>
      )}
    </Layout>
  )
}

export async function getStaticProps({ params }) {
  const data = await getProductAndMoreProducts(params.slug)
  return { props: { ...data } }
}

export async function getStaticPaths() {
  const allProducts = await getAllProductsWithSlug()

  return {
    paths: allProducts.edges.map(({ node }) => `/p/${node.handle}`),
    fallback: true,
  }
}
