import { NextPage } from 'next'
import Link from 'next/link'
import Layout from '../components/Layout'

const IndexPage: NextPage = () => {
  return (
    <Layout title="Home | Next.js + TypeScript Example">
      <h1>Type-safe Payments with Next.js, TypeScript, and Stripe 🔒💸</h1>
      <p>
        <Link href="/donate-with-checkout">
          <a>Donate with Checkout</a>
        </Link>
      </p>
      <p>
        <Link href="/donate-with-elements">
          <a>Donate with Elements</a>
        </Link>
      </p>
    </Layout>
  )
}

export default IndexPage
