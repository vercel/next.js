import * as React from "react"
import Link from 'next/link'
import Layout from '../components/Layout'

const index: React.FunctionComponent = () => {
  return (
    <Layout title="Home | Next.js + TypeScript Example">
      <h1>Hello Next.js 👋</h1>
      <p><Link href='/about'><a>About</a></Link></p>
    </Layout>
  )
}

export default index;
