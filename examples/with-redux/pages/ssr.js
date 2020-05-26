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

// The date returned here will be different for every request that hits the page,
// that is because the page becomes a serverless function instead of being statically
// exported when you use `getServerSideProps` or `getInitialProps`
export function getServerSideProps() {
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
