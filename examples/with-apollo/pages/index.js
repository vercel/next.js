import App from '../components/App'
import Header from '../components/Header'
import Submit from '../components/Submit'
import PostList from '../components/PostList'

export default ({ router }) => (
  <App>
    <Header pathname={router.pathname} />
    <Submit />
    <PostList />
  </App>
)
