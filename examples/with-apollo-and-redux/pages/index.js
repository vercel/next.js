import { useDispatch } from 'react-redux'
import { initializeStore } from '../lib/redux'
import getApolloState from '../lib/getApolloState'
import useInterval from '../lib/useInterval'
import Layout from '../components/Layout'
import Clock from '../components/Clock'
import Counter from '../components/Counter'
import Submit from '../components/Submit'
import PostList from '../components/PostList'

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
  const { dispatch } = reduxStore

  // If you build and start the app, the date added here will have the same
  // value for all requests, as this method gets executed at build time.
  dispatch({
    type: 'TICK',
    light: true,
    lastUpdate: Date.now(),
  })

  const initialApolloState = await getApolloState(IndexPage, reduxStore)
  const initialReduxState = reduxStore.getState()

  return { props: { initialApolloState, initialReduxState } }
}

export default IndexPage
