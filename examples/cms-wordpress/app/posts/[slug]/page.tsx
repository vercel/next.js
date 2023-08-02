// This file has been sourced from: /intuita/next.js/examples/cms-wordpress/pages/posts/[slug].tsx
import { notFound, redirect } from 'next/navigation'
import { Metadata } from 'next'
import { GetStaticPaths, GetStaticProps } from 'next'
import Container from '../../../components/container'
import PostBody from '../../../components/post-body'
import MoreStories from '../../../components/more-stories'
import Header from '../../../components/header'
import PostHeader from '../../../components/post-header'
import SectionSeparator from '../../../components/section-separator'
import Layout from '../../../components/layout'
import PostTitle from '../../../components/post-title'
import Tags from '../../../components/tags'
import { getAllPostsWithSlug, getPostAndMorePosts } from '../../../lib/api'
import { CMS_NAME, HOME_OG_IMAGE_URL } from '../../../lib/constants'
import NotFound from './notFound'
type Params = {
  [key: string]: string | string[] | undefined
}
type PageProps = {
  params: Params
}
const getStaticProps: GetStaticProps = async ({
  params,
  preview = false,
  previewData,
}) => {
  const data = await getPostAndMorePosts(params?.slug, preview, previewData)
  return {
    props: {
      preview,
      post: data.post,
      posts: data.posts,
    },
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
export default async function Post({ params }: PageProps) {
  const { post, posts, preview } = await getData({
    params,
  })
  const morePosts = posts?.edges
  if (!false && !post?.slug) {
    return <NotFound />
  }
  return (
    <Layout preview={preview}>
      <Container>
        <Header />
        {false ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>
              <PostHeader
                title={post.title}
                coverImage={post.featuredImage}
                date={post.date}
                author={post.author}
                categories={post.categories}
              />
              <PostBody content={post.content} />
              <footer>
                {post.tags.edges.length > 0 && <Tags tags={post.tags} />}
              </footer>
            </article>

            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  )
}
const getStaticPaths: GetStaticPaths = async () => {
  const allPosts = await getAllPostsWithSlug()
  return {
    paths: allPosts.edges.map(({ node }) => `/posts/${node.slug}`) || [],
    fallback: true,
  }
}
export async function generateStaticParams() {
  return (await getStaticPaths({})).paths
}
export async function generateMetadata({
  params,
}: {
  params: Record<string, string | string[]>
}): Promise<Metadata> {
  const getStaticPropsResult = await getStaticProps({ params })
  if (!('props' in getStaticPropsResult)) {
    return {}
  }
  const { post, posts, preview } = getStaticPropsResult.props
  return {
    title: `
                  ${post.title} | Next.js Blog Example with ${CMS_NAME}
                `,
    openGraph: {
      images: [
        {
          url: HOME_OG_IMAGE_URL,
        },
      ],
    },
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
  }
}
export const revalidate = 10
export const dynamicParams = true
