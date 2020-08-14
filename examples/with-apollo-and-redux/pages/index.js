import { useDispatch } from 'react-redux'
import { initializeStore } from '../lib/redux'
import { initializeApollo } from '../lib/apollo'
import useInterval from '../lib/useInterval'
import Layout from '../components/Layout'
import Clock from '../components/Clock'
import Counter from '../components/Counter'
import Submit from '../components/Submit'
import PostList, {
  ALL_POSTS_QUERY,
  allPostsQueryVars,
} from '../components/PostList'

const IndexPage = () => {
  // Tick the time every second
  const dispatch = useDispatch()

  useInterval(() => {
    dispatch({
      type: 'TICK',
      light: true,
      lastUpdate: Date.now(),
    })
  }, 1000)

  return (
    <Layout>
      {/* Redux */}
      <Clock />
      <Counter />
      <hr />
      {/* Apollo */}
      <Submit />
      <PostList />
    </Layout>
  )
}

export async function getStaticProps() {
  const reduxStore = initializeStore()
  const apolloClient = initializeApollo()
  const { dispatch } = reduxStore

  dispatch({
    type: 'TICK',
    light: true,
    lastUpdate: Date.now(),
  })

  await apolloClient.query({
    query: ALL_POSTS_QUERY,
    variables: allPostsQueryVars,
  })

  return {
    props: {
      initialReduxState: reduxStore.getState(),
      initialApolloState: apolloClient.cache.extract(),
    },
    revalidate: 1,
  }
}

export default IndexPage
