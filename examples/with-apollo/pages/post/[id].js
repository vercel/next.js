import App from '../../components/App'
import InfoBox from '../../components/InfoBox'
import Header from '../../components/Header'
import { ALL_POSTS_QUERY, allPostsQueryVars } from '../../components/PostList'
import Post, { POST_BY_ID } from '../../components/Post'
import { initializeApollo } from '../../lib/apolloClient'

const PostPage = () => (
  <App>
    <Header />
    <InfoBox>ℹ️ SSG post page (supports iSSG).</InfoBox>
    <Post />
  </App>
)

export async function getStaticPaths() {
  const apolloClient = initializeApollo()

  const { data } = await apolloClient.query({
    query: ALL_POSTS_QUERY,
    variables: allPostsQueryVars,
  })

  const paths = data.allPosts.map(({ id }) => ({
    params: {
      id,
    },
  }))

  return {
    paths,
    fallback: true,
  }
}

export async function getStaticProps({ params: { id } }) {
  const apolloClient = initializeApollo()

  await apolloClient.query({
    query: POST_BY_ID,
    variables: { id },
  })

  return {
    props: {
      initialApolloState: apolloClient.cache.extract(),
    },
    revalidate: 1,
  }
}

export default PostPage
