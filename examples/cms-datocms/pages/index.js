import Container from '../components/container'
import MoreStories from '../components/more-stories'
import HeroPost from '../components/hero-post'
import Intro from '../components/intro'
import Layout from '../components/layout'

export default function Index() {
  return (
    <>
      <Layout>
        <Container>
          <Intro />
          <HeroPost />
          <MoreStories
            posts={[
              {
                title: 'Preview Mode for Static Generation',
              },
              {
                title: 'Dynamic Routing and Static Generation',
              },
              {
                title: 'Deploying Next.js Apps',
              },
              {
                title: 'From Server-side Rendering to Static Generation',
              },
            ]}
          />
        </Container>
      </Layout>
    </>
  )
}
