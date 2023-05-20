import { GetStaticPropsContext, GetStaticPropsResult } from 'next'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { predicate } from '@prismicio/client'
import { asImageSrc, asText } from '@prismicio/helpers'

import { CMS_NAME } from '../../lib/constants'
import { PostDocumentWithAuthor } from '../../lib/types'
import { createClient } from '../../lib/prismic'

import Container from '../../components/container'
import Header from '../../components/header'
import Layout from '../../components/layout'
import MoreStories from '../../components/more-stories'
import PostBody from '../../components/post-body'
import PostHeader from '../../components/post-header'
import PostTitle from '../../components/post-title'
import SectionSeparator from '../../components/section-separator'

type PostProps = {
  preview: boolean
  post: PostDocumentWithAuthor
  morePosts: PostDocumentWithAuthor[]
}

export default function Post({ post, morePosts, preview }: PostProps) {
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
                  {asText(post.data.title)} | Next.js Blog Example with{' '}
                  {CMS_NAME}
                </title>
                <meta
                  property="og:image"
                  content={asImageSrc(post.data.cover_image, {
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

export async function getStaticProps({
  params,
  preview = false,
  previewData,
}: GetStaticPropsContext<{ slug: string }>): Promise<
  GetStaticPropsResult<PostProps>
> {
  const client = createClient({ previewData })

  const [post, morePosts] = await Promise.all([
    client.getByUID<PostDocumentWithAuthor>('post', params.slug, {
      fetchLinks: ['author.name', 'author.picture'],
    }),
    client.getAllByType<PostDocumentWithAuthor>('post', {
      fetchLinks: ['author.name', 'author.picture'],
      orderings: [{ field: 'my.post.date', direction: 'desc' }],
      predicates: [predicate.not('my.post.uid', params.slug)],
      limit: 2,
    }),
  ])

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
