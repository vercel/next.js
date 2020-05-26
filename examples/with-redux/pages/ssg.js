import { useDispatch } from 'react-redux'
import { withRedux, initializeServerSideStore } from '../lib/redux'
import useInterval from '../lib/useInterval'
import Clock from '../components/clock'
import Counter from '../components/counter'
import Nav from '../components/nav'

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
    <>
      <Nav />
      <Clock />
      <Counter />
    </>
  )
}
// If you build and start the app, the date returned here will have the same
// value for all requests, as this method gets executed at build time.
export function getStaticProps() {
  const reduxStore = initializeServerSideStore({
    lastUpdate: Date.now(),
    light: false,
    count: 0,
  })
  // either pass your 'initialState' as an argument to 'initializeServerSideStore()' or dispatch an action

  // const reduxStore = initializeServerSideStore()
  // const { dispatch } = reduxStore
  // dispatch({
  // 	type: 'TICK',
  // 	light: typeof window === 'object',
  // 	lastUpdate: Date.now(),
  // })
  return { props: { initialReduxState: reduxStore.getState() } }
}

export default withRedux(IndexPage)
