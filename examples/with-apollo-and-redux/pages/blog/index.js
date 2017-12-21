import withData from '../../lib/withData'

import App from '../../components/App'
import Header from '../../components/Header'
import Submit from '../../components/Submit'
import PostList from '../../components/PostList'

export default withData(() => (
  <App>
    <Header />
    <Submit />
    <PostList />
  </App>
))
