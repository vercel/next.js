import { draftMode } from 'next/headers'
import Container from '@/components/container'
import Alert from '@/components/alert'
import MoreStories from '@/components/more-stories'
import HeroPost from '@/components/hero-post'
import Intro from '@/components/intro'
import Footer from '@/components/footer'
import { getAllPostsForHome, toRouteSlug } from '@/lib/api'

export default async function Index() {
  const { isEnabled: preview } = await draftMode()
  const allPosts = await getAllPostsForHome(preview)
  const heroPost = allPosts[0]
  const morePosts = allPosts.slice(1)

  return (
    <>
      <Alert preview={preview} />
      <Container>
        <Intro />
        {heroPost && (
          <HeroPost
            title={heroPost.title}
            coverImage={heroPost.cover?.url}
            date={heroPost._publish_on}
            author={heroPost.author}
            categories={heroPost.categories}
            readTime={heroPost._read_time}
            slug={toRouteSlug(heroPost._slug)}
            excerpt={heroPost.excerpt}
          />
        )}
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
      <Footer />
    </>
  )
}
