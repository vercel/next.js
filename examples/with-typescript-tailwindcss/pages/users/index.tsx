import { GetStaticProps } from 'next'
import Link from 'next/link'

import { User } from '../../interfaces'
import { sampleUserData } from '../../utils/sample-data'
import Layout from '../../components/Layout'
import List from '../../components/List'

type Props = {
  items: User[]
}

const WithStaticProps = ({ items }: Props) => (
  <Layout title="Users List">
    <div class="container w-full md:max-w-3xl mx-auto pt-20">
      <div class="w-full px-4 md:px-6 text-xl text-gray-800 justify-center items-center flex">
        <h1 class="font-bold text-gray-900 pt-6 pb-2 text-3xl md:text-4xl">Users List</h1>
      </div>
      <div className="mt-5 justify-center items-center w-full flex">
        <p>
          Example fetching data from inside <code className="font-bold tracking-wide">getStaticProps()</code>
        </p>
      </div>
      <div className="mt-2 justify-center items-center w-full flex">
        <p>You are currently on: /users</p>
      </div>
      <div className="mt-5 mb-8 justify-center items-center w-full flex">
        <List items={items} />
      </div>
    </div>
  </Layout>
)

export const getStaticProps: GetStaticProps = async () => {
  // Example for including static props in a Next.js function component page.
  // Don't forget to include the respective types for any props passed into
  // the component.
  const items: User[] = sampleUserData
  return { props: { items } }
}

export default WithStaticProps
