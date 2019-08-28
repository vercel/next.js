import withApolloClient from '../lib/with-apollo-client'
import gql from 'graphql-tag'
import Link from 'next/link'
import { useQuery } from '@apollo/react-hooks'

const ViewerQuery = gql`
  query ViewerQuery {
    viewer {
      id
      name
      status @client
    }
  }
`

const Index = () => {
  const {
    data: { viewer }
  } = useQuery(ViewerQuery)

  if (viewer) {
    return (
      <div>
        You're signed in as {viewer.name} and you're {viewer.status} goto{' '}
        <Link href='/about'>
          <a>static</a>
        </Link>{' '}
        page.
      </div>
    )
  }

  return null
}

Index.getInitialProps = async ({ client }) => {
  await client.query({ query: ViewerQuery })
}

export default withApolloClient(Index)
