import { notFound, redirect } from 'next/navigation'
import { Metadata } from 'next'
import Head from 'next/head'
import { GetStaticProps } from 'next'
import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import { getAllPostsForHome } from '../lib/api'
import { CMS_NAME, HOME_OG_IMAGE_URL } from '../lib/constants'

type Params = {
  [key: string]: string | string[] | undefined
}

type PageProps = {
  params: Params
}

export const metadata: Metadata = {
  title: `Next.js Blog Example with ${CMS_NAME}`,
  icons: {
    apple: [
      {
        sizes: '180x180',
        url: '/favicon/apple-touch-icon.png',
      },
    ],
    icon: [
      {
        sizes: '32x32',
        type: 'image/png',
        url: '/favicon/favicon-32x32.png',
      },
      {
        sizes: '16x16',
        type: 'image/png',
        url: '/favicon/favicon-16x16.png',
      },
    ],
    other: [
      {
        url: '/favicon/safari-pinned-tab.svg',
        rel: 'mask-icon',
      },
    ],
    shortcut: [
      {
        url: '/favicon/favicon.ico',
      },
    ],
  },
  manifest: '/favicon/site.webmanifest',
  other: {
    'msapplication-TileColor': '#000000',
    'msapplication-config': '/favicon/browserconfig.xml',
  },
  themeColor: [
    {
      color: '#000',
    },
  ],
  alternates: {
    types: {
      'application/rss+xml': '/feed.xml',
    },
  },
  description: `A statically generated blog example using Next.js and ${CMS_NAME}.`,
  openGraph: {
    images: [
      {
        url: HOME_OG_IMAGE_URL,
      },
    ],
  },
}
export const getStaticProps: GetStaticProps = async ({ preview = false }) => {
  const allPosts = await getAllPostsForHome(preview)
  return {
    props: { allPosts, preview },
    revalidate: 10,
  }
}
async function getData({ params }: { params: Params }) {
  const result = await getStaticProps({ params })

  if ('redirect' in result) {
    redirect(result.redirect.destination)
  }

  if ('notFound' in result) {
    notFound()
  }

  return 'props' in result ? result.props : {}
}
export default async function Index({ params }: PageProps) {
  const {
    allPosts: { edges },
    preview,
  } = await getData({
    params,
  })

  const heroPost = edges[0]?.node
  const morePosts = edges.slice(1)
  return (
    <Layout preview={preview}>
      <Head>
        <title>{`Next.js Blog Example with ${CMS_NAME}`}</title>
      </Head>
      <Container>
        <Intro />
        {heroPost && (
          <HeroPost
            title={heroPost.title}
            coverImage={heroPost.featuredImage}
            date={heroPost.date}
            author={heroPost.author}
            slug={heroPost.slug}
            excerpt={heroPost.excerpt}
          />
        )}
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
    </Layout>
  )
}
export const revalidate = 10
