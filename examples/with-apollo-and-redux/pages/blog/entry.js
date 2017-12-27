import withData from '../../lib/withData'

import App from '../../components/App'
import Header from '../../components/Header'
import Post from '../../components/Post'

export default withData((props) => (
  <App>
    <Header />
    <Post />
  </App>
))
