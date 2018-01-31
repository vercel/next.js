import App from '../components/App'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import withApollo from '../lib/withApollo'

export default withApollo(() => (
  <App>
    <Header />
    <Submit />
    <PostList />
  </App>
))
