import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import {
  getAllPostSlugs,
  getPostBySlug,
  getMorePostsForSlug,
} from '../../lib/api'
import PostTitle from '../../components/post-title'
import Head from 'next/head'
import { CMS_NAME } from '../../lib/constants'

export default function Post({ post, morePosts = [], preview }) {
  const router = useRouter()
  if (!router.isFallback && !post?.slug) {
    return <ErrorPage statusCode={404} />
  }
  return (
    <Layout preview={preview}>
      <Container>
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article className="mb-32">
              <Head>
                <title>
                  {post.title} | Next.js Blog Example with {CMS_NAME}
                </title>
                <meta property="og:image" content={post.coverImage.url} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.coverImage}
                date={post.date}
                author={post.author}
              />
              <PostBody content={post.content} />
            </article>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params, preview = null }) {
  return await Promise.all([
    getPostBySlug(params.slug, preview),
    getMorePostsForSlug(params.slug, preview),
  ]).then((values) => ({
    props: {
      post: values[0],
      morePosts: values[1],
      preview,
    },
  }))
}

export async function getStaticPaths() {
  const slugs = await getAllPostSlugs(['slug'])
  return {
    paths: slugs.map(
      (slug) =>
        ({
          params: {
            slug,
          },
        } || [])
    ),
    fallback: false,
  }
}
