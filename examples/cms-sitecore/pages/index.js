import { CMS_NAME } from '../lib/constants'
import Container from '../components/container'
import Head from 'next/head'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import MoreStories from '../components/more-stories'
import { getAllPosts } from '../lib/api'

export default function Index({ preview, allPosts }) {
  const heroPost = allPosts[0]  
  const morePosts = allPosts.slice(1)
  return (
    <>
      <Layout preview={preview}>
        <Head>
          <title>Next.js Blog Example with {CMS_NAME}</title>
        </Head>
        <Container>
          <Intro />
          {heroPost && (
            <HeroPost
              title={heroPost.title}
              coverImage={heroPost.coverImage}
              date={heroPost.date}
              author={heroPost.author}
              id={heroPost.id}
              excerpt={heroPost.excerpt}
            />
          )}
          {morePosts.length > 0 && <MoreStories posts={morePosts} />}
        </Container>
      </Layout>
    </>
  )
}

export async function getStaticProps({ preview = true }) {
  const allPosts = await getAllPosts(preview) ?? []
  return {
    props: { preview, allPosts },
  }
}
