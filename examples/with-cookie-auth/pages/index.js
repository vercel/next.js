import Link from 'next/link'
import Layout from '../components/Layout'
import { authInitialProps } from '../lib/auth'

export default class Home extends React.PureComponent {
  render() {
    return (
      <Layout {...this.props}>
        <h1>Home</h1>
        Try:
        <ul>
          <li><Link href='/profile'><a>Profile</a></Link></li>
        </ul>
      </Layout>
    )
  }
}

Home.getInitialProps = authInitialProps()
