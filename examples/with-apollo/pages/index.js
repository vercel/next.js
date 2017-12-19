import App from '../components/App'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList from '../components/PostList'
import withData from '../lib/withData'

export default withData(() => (
  <App>
    <Header />
    <Submit />
    <PostList />
  </App>
))
