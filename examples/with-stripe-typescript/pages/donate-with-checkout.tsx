import { NextPage } from 'next'
import Link from 'next/link'
import Layout from '../components/Layout'

import CheckoutForm from '../components/CheckoutForm'

const DonatePage: NextPage = () => {
  return (
    <Layout title="Donate with Checkout | Next.js + TypeScript Example">
      <h1>Donate with Checkout</h1>
      <p>Donate to our project 💖</p>
      <CheckoutForm />
      <p>
        <Link href="/">
          <a>Go home</a>
        </Link>
      </p>
    </Layout>
  )
}

export default DonatePage
