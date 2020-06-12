import { NextPage } from 'next'
import Layout from '../components/Layout'

import CartSummary from '../components/CartSummary'
import Products from '../components/Products'

const DonatePage: NextPage = () => {
  return (
    <Layout title="Shopping Cart | Next.js + TypeScript Example">
      <div className="page-container">
        <h1>Shopping Cart</h1>
        <CartSummary />
        <Products />
      </div>
    </Layout>
  )
}

export default DonatePage
