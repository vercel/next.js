import Layout from '../components/Layout'
import { Button } from 'antd-mobile'
import Link from 'next/link'

export default () => (
  <Layout title="About">
    <Link href="/">
      <Button>Go to Index</Button>
    </Link>
  </Layout>
)
