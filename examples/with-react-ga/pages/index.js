import Link from 'next/link'
import Layout from '../components/Layout'

export default () => (
  <Layout><div>Hello World. <Link href='/about'><a>About</a></Link></div></Layout>
)
