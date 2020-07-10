import ErrorPage from 'next/error'
import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getPageData } from '@/lib/api'
import { CartProvider } from '@/lib/cart'
import Layout from '@/components/layout'
import Container from '@/components/container'
import Header from '@/components/header'
import CartModal from '@/components/cart-modal'
import HtmlContent from '@/components/html-content'

export default function About({ shop, pages, pageByHandle }) {
  if (!pageByHandle) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <Layout>
      <Head>
        <title>Next.js Ecommerce Example with {CMS_NAME}</title>
      </Head>
      <Container>
        <CartProvider>
          <Header title={shop.name} pages={pages} />
          <section className="my-32">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-6xl mb-12">{pageByHandle.title}</h1>
              <HtmlContent content={pageByHandle.body} />
            </div>
          </section>
          <CartModal />
        </CartProvider>
      </Container>
    </Layout>
  )
}

export async function getStaticProps() {
  const data = await getPageData('about')
  return { props: { ...data } }
}
