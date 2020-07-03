import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getAllProductsWithSlug, getProductAndMoreProducts } from '@/lib/api'
import { CartProvider } from '@/lib/cart'
import Layout from '@/components/layout'
import Container from '@/components/container'
import Header from '@/components/header'
import ProductBody from '@/components/product-body'
import CartModal from '@/components/cart-modal'

export default function Index({ shop, product, moreProducts }) {
  const router = useRouter()

  if (!router.isFallback && !product?.handle) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <Layout>
      <Head>
        <title>
          {product?.title ? `${product.title} | ` : ''}Next.js Blog Example with{' '}
          {CMS_NAME}
        </title>
        <meta property="og:image" content={product.image} />
      </Head>
      <Container>
        <CartProvider>
          <Header />
          {router.isFallback ? (
            <h1 className="text-5xl">Loading...</h1>
          ) : (
            <ProductBody />
          )}
          <CartModal />
        </CartProvider>
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params }) {
  const data = await getProductAndMoreProducts(params.slug)

  return {
    props: {
      shop: data.shop,
      product: data.product,
      // moreProducts: data.recommendedProducts,
    },
  }
}

export async function getStaticPaths() {
  const allProducts = await getAllProductsWithSlug()

  return {
    paths: allProducts.edges.map(({ node }) => `/p/${node.handle}`),
    fallback: true,
  }
}
