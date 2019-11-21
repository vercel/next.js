import flowRight from 'lodash.flowright'

import { Nav } from '../components/Nav'
import { withLanguages } from '../hocs/withLanguages'
import { withUserAgent } from '../hocs/withUserAgent'

const IndexPage = props => (
  <div>
    <Nav />
    <h1>Index</h1>
    <pre>{JSON.stringify(props, null, 2)}</pre>
  </div>
)

export default flowRight([withLanguages, withUserAgent])(IndexPage)
