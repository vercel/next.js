import Layout from '../components/Layout'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import { withApollo } from '../lib/apollo'

const ApolloPage = () => (
  <Layout>
    <Submit />
    <PostList />
  </Layout>
)

export default withApollo(ApolloPage)
