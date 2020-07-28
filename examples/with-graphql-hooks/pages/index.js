import { initializeGraphQL } from '../lib/graphql-client'
import graphQLRequest from '../lib/graphql-request'
import App from '../components/app'
import Header from '../components/header'
import PostList, {
  allPostsQuery,
  allPostsQueryOptions,
} from '../components/post-list'

export default function Home() {
  return (
    <App>
      <Header />
      <PostList />
    </App>
  )
}

export async function getStaticProps() {
  const client = initializeGraphQL()

  await graphQLRequest(client, allPostsQuery, allPostsQueryOptions())

  return {
    props: {
      initialGraphQLState: client.cache.getInitialState(),
    },
    revalidate: 1,
  }
}
