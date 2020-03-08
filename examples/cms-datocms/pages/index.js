import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'
import fetchAPI from '../lib/api'

export default function Index({ allPosts }) {
  const heroPost = allPosts[0]
  const morePosts = allPosts.slice(1)
  return (
    <>
      <Layout>
        <Container>
          <Intro />
          {heroPost && <HeroPost {...allPosts[0]} />}
          {morePosts && <MoreStories posts={morePosts} />}
        </Container>
      </Layout>
    </>
  )
}

export async function getStaticProps({ preview }) {
  const data = await fetchAPI(
    `
  {
    allPosts(orderBy: date_DESC) {
      title
      slug
      excerpt
      coverImage {
        responsiveImage(imgixParams: {fm: jpg, fit: crop, w: 2000, h: 1000 }) {
          srcSet
          webpSrcSet
          sizes
          src
          width
          height
          aspectRatio
          bgColor
          base64
        }
      }
      date
      author {
        name
        picture {
          url(imgixParams: {w: 100, h: 100})
        }
      }
    }
  }
  `,
    { preview }
  )
  return {
    props: data,
  }
}
