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

export default function Index({ shop, pages, products }) {
  return (
    <Layout shop={shop} pages={pages}>
      <Head>
        <title>Next.js Ecommerce Example with {CMS_NAME}</title>
      </Head>
      <Container>
        <CartProvider>
          <Header title={shop.name} pages={pages} />
          <Intro />
          <section className="my-32">
            <Products products={products.edges} />
          </section>
          <CartModal />
        </CartProvider>
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ preview }) {
  const data = await getShopDataForHome()
  return { props: { ...data } }
}
