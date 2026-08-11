import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import Container from '@/components/container'
import Alert from '@/components/alert'
import PostBody from '@/components/post-body'
import MoreStories from '@/components/more-stories'
import Header from '@/components/header'
import PostHeader from '@/components/post-header'
import SectionSeparator from '@/components/section-separator'
import Footer from '@/components/footer'
import { getAllSlugs, getPostAndMorePosts, toRouteSlug } from '@/lib/api'
import { SITE_NAME, CMS_NAME } from '@/lib/constants'

export async function generateStaticParams() {
  const posts = await getAllSlugs()
  return posts.map((post) => ({ slug: toRouteSlug(post._slug) }))
}

export async function generateMetadata({ params }) {
  const { slug } = await params
  const { post } = await getPostAndMorePosts(slug)
  if (!post) return {}
  return {
    title: `${post.title} | ${SITE_NAME} with ${CMS_NAME}`,
    openGraph: {
      images: post.cover?.url ? [post.cover.url] : [],
    },
  }
}

export default async function Post({ params }) {
  const { slug } = await params
  const { isEnabled: preview } = await draftMode()
  const { post, morePosts } = await getPostAndMorePosts(slug, preview)

  if (!post) {
    notFound()
  }

  return (
    <>
      <Alert preview={preview} />
      <Container>
        <Header />
        <article>
          <PostHeader
            title={post.title}
            coverImage={post.cover?.url}
            date={post._publish_on}
            author={post.author}
            categories={post.categories}
            readTime={post._read_time}
          />
          <PostBody content={post.content} />
        </article>
        <SectionSeparator />
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
      <Footer />
    </>
  )
}
