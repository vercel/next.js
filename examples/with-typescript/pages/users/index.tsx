import { NextPage } from 'next'
import Link from 'next/link'

import Layout from '../../components/Layout'
import List from '../../components/List'
import { User } from '../../interfaces'
import { sampleFetchWrapper } from '../../utils/sample-api'

type Props = {
  items: User[]
  pathname: string
}

const WithInitialProps: NextPage<Props> = ({ items, pathname }) => (
  <Layout title="Users List | Next.js + TypeScript Example">
    <h1>Users List</h1>
    <p>
      Example fetching data from inside <code>getInitialProps()</code>.
    </p>
    <p>You are currently on: {pathname}</p>
    <List items={items} />
    <p>
      <Link href="/">
        <a>Go home</a>
      </Link>
    </p>
  </Layout>
)

WithInitialProps.getInitialProps = async ({ pathname }) => {
  // Example for including initial props in a Next.js function component page.
  // Don't forget to include the respective types for any props passed into
  // the component.
  const items: User[] = await sampleFetchWrapper(
    'http://localhost:3000/api/users'
  )

  return { items, pathname }
}

export default WithInitialProps
