import Link from 'next/link'
import Layout from '../components/Layout'
import { Data } from './api/orders'

const IndexPage = () => (
  <Layout title="Home | Next.js + Temporal Example">
    <h1>Hello Next.js 👋</h1>

    <button
      onClick={async () => {
        const newOrder = { itemId: 'B102', quantity: 2 }
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { Authorization: 'session-id-or-jwt' },
          body: JSON.stringify(newOrder),
        })
        const data: Data = await response.json()
        console.log(data)
        alert(data.result)
      }}
    >
      Create order
    </button>

    <p>
      <Link href="/about">About</Link>
    </p>
  </Layout>
)

export default IndexPage
