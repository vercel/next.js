import { NextPage, GetStaticProps } from 'next'
import Link from 'next/link'
import Layout from '../components/Layout'
import List from '../components/List'
import { User } from '../interfaces'
import { findAll } from '../utils/sample-api'

type Props = {
  items: User[]
  pathname: string
}

const WithStaticProps: NextPage<Props> = ({ items }) => (
  <Layout title="List Example (as Functional Component) | Next.js + TypeScript Example">
    <h1>List Example (as Function Component)</h1>
    <List items={items} />
    <p>
      <Link href="/">
        <a>Go home</a>
      </Link>
    </p>
  </Layout>
)

// Fetch data at build time.
export const getStaticProp: GetStaticProps = async () => {
  // Example for including getStaticProps in a Next.js function component page.
  // the component.
  const items: User[] = await findAll()

  return { props: { items } }
}

export default WithStaticProps
