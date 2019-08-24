import App from '../components/App'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import withApolloClient from '../lib/with-apollo-client'

const IndexPage = props => (
  <App>
    <Header />
    <Submit />
    <PostList />
  </App>
)

export default withApolloClient(IndexPage)
