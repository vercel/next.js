import Container from '../components/container'
import PostBody from '../components/post-body'
import MoreStories from '../components/more-stories'
import Header from '../components/header'
import PostHeader from '../components/post-header'
import SectionSeparator from '../components/section-separator'
import Layout from '../components/layout'

export default function Article() {
  return (
    <Layout>
      <Container>
        <Header />
        <article>
          <PostHeader />
          <PostBody />
        </article>
        <SectionSeparator />
        <MoreStories
          posts={[
            {
              title: 'Preview Mode for Static Generation',
            },
            {
              title: 'Dynamic Routing and Static Generation',
            },
          ]}
        />
      </Container>
    </Layout>
  )
}
