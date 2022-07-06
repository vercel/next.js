import { useRouter } from 'next/router'
import ErrorPage from 'next/error'
import Container from '@/components/container'
import PostBody from '@/components/post-body'
import MoreStories from '@/components/more-stories'
import Header from '@/components/header'
import PostHeader from '@/components/post-header'
import SectionSeparator from '@/components/section-separator'
import Layout from '@/components/layout'
import { getAllPostsWithSlug, getPostAndMorePosts } from '@/lib/api'
import PostTitle from '@/components/post-title'
import Head from 'next/head'
import { CMS_NAME, BUILDER_CONFIG } from '@/lib/constants'
import { Builder, builder, BuilderContent } from '@builder.io/react'
import '@builder.io/widgets'

builder.init(BUILDER_CONFIG.apiKey)
Builder.isStatic = true

export default function Post({ post, morePosts, preview }) {
  const router = useRouter()
  const isLive = !Builder.isEditing && !Builder.isPreviewing && !preview
  if (!router.isFallback && !post && isLive) {
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
            <BuilderContent
              {...(!Builder.isEditing && { content: post })}
              modelName={BUILDER_CONFIG.postsModel}
              options={{ includeRefs: true, model: BUILDER_CONFIG.postsModel }}
              isStatic
            >
              {(data) =>
                data && (
                  <article>
                    <Head>
                      <title>
                        {data.title} | Next.js Blog Example with {CMS_NAME}
                      </title>
                      <meta property="og:image" content={data.image} />
                    </Head>
                    {data.author?.value && (
                      <PostHeader
                        title={data.title}
                        coverImage={data.image}
                        date={post.lastUpdated}
                        author={data.author.value?.data}
                      />
                    )}
                    <PostBody content={post} />
                  </article>
                )
              }
            </BuilderContent>
            <SectionSeparator />
            {morePosts.length > 0 && <MoreStories posts={morePosts} />}
          </>
        )}
      </Container>
    </Layout>
  )
}

export async function getStaticProps({ params, preview = false, previewData }) {
  let { post, morePosts } = await getPostAndMorePosts(
    params.slug,
    preview,
    previewData
  )

  return {
    props: {
      key: post?.id + post?.data.slug + params.slug,
      preview,
      post,
      morePosts,
    },
  }
}

export async function getStaticPaths() {
  const allPosts = await getAllPostsWithSlug()
  return {
    paths: allPosts?.map((post) => `/posts/${post.data.slug}`) || [],
    fallback: true,
  }
}
