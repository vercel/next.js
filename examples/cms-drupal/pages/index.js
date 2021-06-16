import Head from 'next/head'
import { getResourceCollectionFromContext } from 'next-drupal'

import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import { CMS_NAME } from '../lib/constants'
import { absoluteURL } from '../lib/api'

export default function Index({ posts }) {
  const heroPost = posts[0]
  const morePosts = posts.slice(1)
  return (
    <Layout>
      <Head>
        <title>Next.js Blog Example with {CMS_NAME}</title>
      </Head>
      <Container>
        <Intro />
        {heroPost && (
          <HeroPost
            title={heroPost.title}
            coverImage={{
              sourceUrl: absoluteURL(heroPost.field_image.uri.url),
            }}
            date={heroPost.created}
            author={{
              name: heroPost.uid.field_name,
              avatar: {
                url: absoluteURL(heroPost.uid.user_picture.uri.url),
              },
            }}
            slug={heroPost.path.alias}
            excerpt={heroPost.body.summary}
          />
        )}
        {morePosts.length > 0 && <MoreStories posts={morePosts} />}
      </Container>
    </Layout>
  )
}

export async function getStaticProps(context) {
  const posts = await getResourceCollectionFromContext(
    'node--article',
    context,
    {
      params: {
        include: 'field_image,uid,uid.user_picture',
        sort: '-created',
      },
    }
  )

  return {
    props: { posts },
  }
}
