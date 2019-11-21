import withApollo from '../../lib/withApollo'

import App from '../../components/App'
import Header from '../../components/Header'
import Post from '../../components/Post'

export default withApollo(() => (
  <App>
    <Header />
    <Post />
  </App>
))
