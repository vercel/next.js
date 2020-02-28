import { withApollo } from '../apollo/client'
import gql from 'graphql-tag'
import Link from 'next/link'
import { useQuery } from '@apollo/react-hooks'
import { ViewerQuery } from '../generated/graphql'

const ViewerQuery = gql`
  query Viewer {
    viewer {
      id
      name
      status
    }
  }
`

const Index = () => {
  const { data, loading, error } = useQuery<ViewerQuery>(ViewerQuery)

  if (loading || error) {
    return null
  }

  if (data) {
    const { viewer } = data
    return (
      <div>
        You're signed in as {viewer.name} and you're {viewer.status} goto{' '}
        <Link href="/about">
          <a>static</a>
        </Link>{' '}
        page.
      </div>
    )
  }

  return null
}

export default withApollo(Index)
