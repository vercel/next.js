import { NextPage } from 'next'
import Link from 'next/link'
import Layout from '../components/Layout'

import ElementsForm from '../components/ElementsForm'

const DonatePage: NextPage = () => {
  return (
    <Layout title="Donate with Elements | Next.js + TypeScript Example">
      <h1>Donate with Elements</h1>
      <p>Donate to our project 💖</p>
      <ElementsForm />
      <p>
        <Link href="/">
          <a>Go home</a>
        </Link>
      </p>
    </Layout>
  )
}

export default DonatePage
