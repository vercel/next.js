import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getShopDataForHome } from '@/lib/api'
import { CartProvider } from '@/lib/cart'
import Layout from '@/components/layout'
import Container from '@/components/container'
import Header from '@/components/header'
import Intro from '@/components/intro'
import Products from '@/components/products'
import CartModal from '@/components/cart-modal'

export default function Index({ shop, products }) {
  console.log('SHOP', shop)

  return (
    <Layout>
      <Head>
        <title>Next.js Ecommerce Example with {CMS_NAME}</title>
      </Head>
      <Container>
        <CartProvider>
          <Header title={shop.name} />
          <Intro />
          <Products products={products} />
          <CartModal />
        </CartProvider>
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ preview }) {
  const { shop, products } = await getShopDataForHome()

  return {
    props: { allPosts: [], shop, products },
  }
}
