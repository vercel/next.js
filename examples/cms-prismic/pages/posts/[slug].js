import { useRouter } from 'next/router'
import Head from 'next/head'
import { predicate } from '@prismicio/client'
import Container from '../../components/container'
import PostBody from '../../components/post-body'
import MoreStories from '../../components/more-stories'
import Header from '../../components/header'
import PostHeader from '../../components/post-header'
import SectionSeparator from '../../components/section-separator'
import Layout from '../../components/layout'
import PostTitle from '../../components/post-title'
import { CMS_NAME } from '../../lib/constants'
import { createClient } from '../../lib/prismic'
import { asImageSrc, asText } from '@prismicio/helpers'

/** @param {import("next").InferGetStaticPropsType<typeof getStaticProps>>} */
export default function Post({ post, morePosts, preview }) {
  const router = useRouter()

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
                  {asText(post.title)} | Next.js Blog Example with {CMS_NAME}
                </title>
                <meta
                  property="og:image"
                  content={asImageSrc(post.cover_image, {
                    width: 1200,
                    height: 600,
                    fit: 'crop',
                  })}
                />
              </Head>
              <PostHeader
                title={post.data.title}
                coverImage={post.data.cover_image}
                date={post.data.date}
                author={post.data.author}
              />
              <PostBody slices={post.data.slices} />
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

/** @param {import("next").GetStaticPropsContext<{ slug: string }>} */
export async function getStaticProps({ params, preview = false, previewData }) {
  const client = createClient({ previewData })

  const post = await client.getByUID('post', params.slug, {
    fetchLinks: ['author.name', 'author.picture'],
  })
  const morePosts = await client.getAllByType('post', {
    fetchLinks: ['author.name', 'author.picture'],
    orderings: [{ field: 'my.post.date', direction: 'desc' }],
    predicates: [predicate.not('my.post.uid', params.slug)],
    limit: 2,
  })

  if (!post) {
    return {
      notFound: true,
    }
  } else {
    return {
      props: { preview, post, morePosts },
    }
  }
}

export async function getStaticPaths() {
  const client = createClient()

  const allPosts = await client.getAllByType('post')

  return {
    paths: allPosts.map((post) => post.url),
    fallback: true,
  }
}
