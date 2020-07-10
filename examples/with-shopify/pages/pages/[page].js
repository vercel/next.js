import ErrorPage from 'next/error'
import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'
import { getShopPage, getShopPagesHandles } from '@/lib/api'
import Layout from '@/components/layout'
import HtmlContent from '@/components/html-content'

export default function Page({ shop, pages, pageByHandle }) {
  if (!pageByHandle) {
    return <ErrorPage statusCode={404} />
  }

  return (
    <Layout shop={shop} pages={pages}>
      <Head>
        <title>Next.js Ecommerce Example with {CMS_NAME}</title>
      </Head>

      <section className="my-32">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-6xl mb-12">{pageByHandle.title}</h1>
          <HtmlContent content={pageByHandle.body} />
        </div>
      </section>
    </Layout>
  )
}

export async function getStaticProps({ params }) {
  const data = await getShopPage(params.page)
  return { props: { ...data } }
}

export async function getStaticPaths() {
  const pages = await getShopPagesHandles()

  return {
    paths: pages.edges.map(({ node }) => ({ params: { page: node.handle } })),
    fallback: false,
  }
}
