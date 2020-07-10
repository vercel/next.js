import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getShopPageForHome } from '@/lib/api'
import Layout from '@/components/layout'
import Intro from '@/components/intro'
import Products from '@/components/products'

export default function Index({ shop, pages, products }) {
  return (
    <Layout shop={shop} pages={pages}>
      <Head>
        <title>Next.js Ecommerce Example with {CMS_NAME}</title>
      </Head>
      <Intro />
      <section className="my-32">
        <Products products={products.edges} />
      </section>
    </Layout>
  )
}

export async function getStaticProps({ preview }) {
  const data = await getShopPageForHome()
  return { props: { ...data } }
}
