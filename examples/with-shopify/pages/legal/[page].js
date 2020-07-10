import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { LEGAL, getLegalPages } from '@/lib/shop-utils'
import { getLegalPage, getLegalPagesHandles } from '@/lib/api'
import { CartProvider } from '@/lib/cart'
import Layout from '@/components/layout'
import Container from '@/components/container'
import Header from '@/components/header'
import CartModal from '@/components/cart-modal'
import HtmlContent from '@/components/html-content'

export default function Page({ shop, pages, pageByHandle }) {
  const { query } = useRouter()
  const page = shop[LEGAL[query.page]]

  if (!page) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <Layout shop={shop} pages={pages}>
      <Head>
        <title>Next.js Ecommerce Example with {CMS_NAME}</title>
      </Head>
      <Container>
        <CartProvider>
          <Header title={shop.name} pages={pages} />
          <section className="my-32">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-6xl mb-12">{page.title}</h1>
              <HtmlContent content={page.body} />
            </div>
          </section>
          <CartModal />
        </CartProvider>
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params }) {
  const data = await getLegalPage(LEGAL[params.page])
  return { props: { ...data } }
}

export async function getStaticPaths() {
  const shop = await getLegalPagesHandles()

  return {
    paths: getLegalPages(shop).map((page) => ({
      params: { page: page.handle },
    })),
    fallback: false,
  }
}
