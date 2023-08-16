import { useRouter } from 'next/router'
import Head from 'next/head'
import ErrorPage from 'next/error'
import Container from '@components/container'
import MoreStories from '@components/more-stories'
import Header from '@components/header'
import PostHeader from '@components/post-header'
import PostBody from '@components/post-body'
import SectionSeparator from '@components/section-separator'
import Layout from '@components/layout'
import PostTitle from '@components/post-title'
import { CMS_NAME } from '@lib/constants'
import { getAllPostsWithSlug, getPostAndMorePosts } from '@lib/api'

export default function Post({ post, morePosts, preview }) {
  const router = useRouter()

  if (!router.isFallback && !post) {
    return <ErrorPage statusCode={404} />
  }

  const title = `${
    post?.title || 'dotcms'
  } | Next.js Blog Example with ${CMS_NAME}`

  return (
    <Layout preview={preview}>
      <Container>
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article>
              <Head>
                <title>{title}</title>
                <meta
                  property="og:image"
                  content={`${process.env.NEXT_PUBLIC_DOTCMS_HOST}${post.image.idPath}`}
                />
              </Head>

              <PostHeader
                title={post.title}
                coverImage={post.image}
                author={post.author}
              />

              <PostBody content={post} />
            </article>

            <SectionSeparator />

            {morePosts && morePosts.length > 0 && (
              <MoreStories posts={morePosts} />
            )}
          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params, preview = false }) {
  const data = await getPostAndMorePosts(params.slug, preview)

  return {
    props: {
      preview,
      ...data,
    },
  }
}

export async function getStaticPaths() {
  const allPosts = await getAllPostsWithSlug()

  return {
    paths: allPosts?.map((post) => `/posts/${post.urlTitle}`) || [],
    fallback: true,
  }
}
