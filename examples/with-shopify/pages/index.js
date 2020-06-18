import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getShopDataForHome } from '@/lib/api'
import { CartProvider } from '@/lib/cart'
import MoreStories from '@/components/more-stories'
import HeroPost from '@/components/hero-post'
import Layout from '@/components/layout'
import Container from '@/components/container'
import Intro from '@/components/intro'
import Products from '@/components/products'
import CartModal from '@/components/cart-modal'

export default function Index({ shop, products, allPosts }) {
  const heroPost = allPosts[0]
  const morePosts = allPosts.slice(1)

  console.log('SHOP', shop)
  // console.log('PRODUCTS', products)

  return (
    <>
      <Layout>
        <Head>
          <title>Next.js Blog Example with {CMS_NAME}</title>
        </Head>
        <Container>
          <CartProvider>
            <Intro title={shop.name} />
            <Products products={products} />
            <CartModal />
          </CartProvider>
        </Container>
      </Layout>
    </>
  )
}

export async function getStaticProps({ preview }) {
  // const allPosts = (await getAllPostsForHome(preview)) || []
  const { shop, products } = await getShopDataForHome()

  return {
    props: { allPosts: [], shop, products },
  }
}
