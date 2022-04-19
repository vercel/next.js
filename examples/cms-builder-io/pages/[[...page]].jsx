
import { BuilderComponent, builder, Builder } from '@builder.io/react'
import DefaultErrorPage from 'next/error'
import { useRouter } from 'next/router'
import Layout from '@/components/layout'
import { BUILDER_CONFIG } from '@/lib/constants'
import Head from 'next/head'
import { CMS_NAME } from '@/lib/constants'

builder.init(BUILDER_CONFIG.apiKey)

export default function Page({ page }) {
  const router = useRouter()
  if (router.isFallback) {
    return <h1>Loading...</h1>
  }

  const isLive = !Builder.isEditing && !Builder.isPreviewing
  if (!page && isLive) {
    return (
      <>
        <Head>
          <meta name="robots" content="noindex" />
          <meta name="title"></meta>
        </Head>
        <DefaultErrorPage statusCode={404} />
      </>
    )
  }
  return (
    <>
      <Layout>
        <Head>
          <title>Next.js Blog Example with {CMS_NAME}</title>
        </Head>
          <BuilderComponent model="page" content={page} />
      </Layout>
    </>
  )
}

export async function getStaticPaths() {
  const pages = await builder.getAll('page', {
    options: { noTargeting: true }
  })

  return {
    paths: pages.map((page) => `${page.data?.url}`),
    fallback: true,
  }
}

export async function getStaticProps({
  params,
}) {
  const page = await builder.get('page', {
    userAttributes: {
      urlPath: '/' + (params?.page?.join('/') || ''),
    }
  })
  .toPromise() || null

  return {
    props: {
      page,
    },
    revalidate: 5,
  }
}
