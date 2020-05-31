import Layout from '../components/Layout'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import { renderWithApollo } from '../lib/apollo'

const ApolloPage = () => (
  <Layout>
    <Submit />
    <PostList />
  </Layout>
)

export function getStaticProps() {
  renderWithApollo(ApolloPage)
  return {
    props: {},
  }
}

export default ApolloPage
