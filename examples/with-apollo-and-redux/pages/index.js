import withData from '../lib/withData'

import App from '../components/App'
import Header from '../components/Header'

export default withData(() => (
  <App>
    <Header />
    <h1>Welcome Home.</h1>
  </App>
))
