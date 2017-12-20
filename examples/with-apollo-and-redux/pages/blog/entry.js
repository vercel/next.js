import App from '../../components/App'
import Header from '../../components/Header'
import Post from '../../components/Post'
import withData from '../../lib/withData'

export default withData((props) => (
  <App>
    <Header />
    <Post />
  </App>
))
