import type { InferGetServerSidePropsType, GetServerSideProps } from 'next'
import algoliasearch from 'algoliasearch/lite'
import { getServerState } from 'react-instantsearch-hooks-server'
import { InstantSearchSSRProps, Search } from '../components/Search'
import { renderToString } from 'react-dom/server'
// Demo key provided by https://github.com/algolia/react-instantsearch
const searchClient = algoliasearch(
  'latency',
  '6be0576ff61c053d5f9a3225e2a90f76'
)

const defaultProps = {
  searchClient,
  indexName: 'instant_search',
}

export default function Page({
  serverState,
  serverUrl,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <Search
      {...defaultProps}
      serverState = { serverState }
      serverUrl = { serverUrl }
    />
  )
}

export const getServerSideProps: GetServerSideProps<InstantSearchSSRProps> = async ({
  req,
}) => {
  const protocol = req.headers.referer?.split('://')[0] || 'https';
  const serverUrl = `${protocol}://${req.headers.host}${req.url}`;

  const serverState = await getServerState(<Page serverUrl={serverUrl}/>, {renderToString})

  return {
    props: {
      serverState,
      serverUrl,
    },
  }
}
