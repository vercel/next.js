import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import MoreStories from '../../components/more-stories'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import { getPostBySlug, getAllPostsWithSlug } from '../../lib/api'
import PostTitle from '../../components/post-title'
import Head from 'next/head'
import { CMS_NAME } from '../../lib/constants'

export default function Post({ post, morePosts, preview }) {
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
                <meta property="og:image" content={post.featuredImage} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.featuredImage}
                date={post.createdOn}
                author={post.author}
              />
              <PostBody content={post.body} />
            </article>
            <SectionSeparator />
            {morePosts.data.length > 0 && (
              <MoreStories posts={morePosts.data} />
            )}
          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps(context) {
  const data = await getPostBySlug(context.params.slug, context.preview)

  return {
    props: {
      preview: context.preview ?? false,
      post: {
        ...data.post.data,
      },
      morePosts: data.morePosts,
    },
  }
}

export async function getStaticPaths() {
  const allPosts = await getAllPostsWithSlug()

  return {
    paths: allPosts.map((post) => {
      return {
        params: {
          slug: `/posts/${post.slug}`,
        },
      }
    }),
    fallback: true,
  }
}
