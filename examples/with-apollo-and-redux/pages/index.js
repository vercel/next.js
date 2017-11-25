import App from '../components/App'
import Header from '../components/Header'
import withData from '../lib/withData'

export default withData((props) => (
  <App>
    <Header pathname={props.url.pathname} />
    <h1>Welcome Home.</h1>
  </App>
))
