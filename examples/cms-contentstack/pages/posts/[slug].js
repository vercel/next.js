import { useRouter } from 'next/router'
import Head from 'next/head'
import ErrorPage from 'next/error'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import Stack from '../../lib/api'
import PostTitle from '../../components/post-title'
import { CMS_NAME } from '../../lib/constants'

export default function Post({ post, morePosts, preview }) {
  const router = useRouter()

  if (!router.isFallback && !post) {
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
            <article>
              <Head>
                <title>
                  {post.title} | Next.js Blog Example with {CMS_NAME}
                </title>
                <meta property="og:image" content={post.cover_image.url} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.cover_image}
                date={post.date}
                author={post.author ? post.author[0] : ''}
              />
              <PostBody content={post.content} />
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
  const entryData = await Stack.getSpecificEntry('post', '/' + params.slug, [
    'more_posts',
    'more_posts.author',
    'author',
  ])
  let data = preview
    ? await Stack.getPreviewData(entryData[0].uid)
    : entryData[0]
  return {
    props: {
      preview,
      post: data ?? null,
      morePosts: data?.more_posts ?? null,
    },
  }
}

export async function getStaticPaths() {
  const allPosts = await Stack.getEntry('post', ['more_posts', 'author'])
  return {
    paths:
      allPosts?.map((post) => ({
        params: {
          slug: post.slug,
        },
      })) || [],
    fallback: true,
  }
}
