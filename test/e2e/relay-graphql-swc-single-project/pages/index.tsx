import {
  Environment,
  FetchFunction,
  fetchQuery,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime'
import { GetServerSideProps } from 'next'
import { pagesQuery as pagesQueryType } from '../queries/__generated__/pagesQuery.graphql'
import pagesQuery from '../queries/pagesQuery'

type Props = { greeting: string }

export default function Index({ greeting }: Props) {
  return <p>{greeting}</p>
}

function createGraphQLFetcher(host: string | undefined): FetchFunction {
  return async function fetchGraphQL(params, variables) {
    const url = host ? `http://${host}/api/query` : `/api/query`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: params.text,
        variables,
      }),
    })

    return await response.json()
  }
}

export const getServerSideProps: GetServerSideProps = async ({ req }) => {
  const environment = new Environment({
    store: new Store(new RecordSource({}), {}),
    network: Network.create(createGraphQLFetcher(req.headers.host)),
  })

  const result = await fetchQuery<pagesQueryType>(
    environment,
    pagesQuery,
    {}
  ).toPromise()

  if (!result) {
    throw new Error(
      'Mock GraphQL Server network request finished without a response!'
    )
  }

  return {
    props: { greeting: result.greeting },
  }
}
