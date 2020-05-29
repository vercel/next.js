import Layout from '../components/Layout'
import { Button } from 'antd-mobile'
import Link from 'next/link'

export default function Home() {
  return (
    <Layout title="Index">
      <Link href="/about">
        <Button>Go to About</Button>
      </Link>
    </Layout>
  )
}
