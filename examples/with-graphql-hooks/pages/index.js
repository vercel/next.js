import { initializeGraphQL } from '../lib/graphql-client'
import graphQLRequest from '../lib/graphql-request'
import App from '../components/app'
import Header from '../components/header'
import PostList, {
  ALL_POSTS_QUERY,
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

  await graphQLRequest(client, ALL_POSTS_QUERY, allPostsQueryOptions())

  return {
    props: {
      initialGraphQLState: client.cache.getInitialState(),
    },
    revalidate: 1,
  }
}
