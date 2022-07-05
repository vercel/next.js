import { GetStaticProps, InferGetStaticPropsType, NextPage } from 'next'

import queryGraphql from '../shared/query-graphql'

type Props = InferGetStaticPropsType<typeof getStaticProps>

const IndexPage: NextPage<Props> = ({ users }) => (
  <>
    <h1>Hello Next.js 👋</h1>
    <pre>{JSON.stringify(users, null, 4)}</pre>
  </>
)

export default IndexPage

export const getStaticProps: GetStaticProps = async () => {
  const users = await queryGraphql(`
    query {
      users {
        name
        username
      }
    }
  `)
  return { props: { users } }
}
