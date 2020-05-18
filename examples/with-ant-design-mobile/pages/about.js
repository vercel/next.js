import Layout from '../components/Layout'
import { Button } from 'antd-mobile'
import Link from 'next/link'

export default function About() {
  return (
    <Layout title="About">
      <Link href="/">
        <Button>Go to Index</Button>
      </Link>
    </Layout>
  )
}
