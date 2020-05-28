import { useDispatch } from 'react-redux'
import useInterval from '../lib/useInterval'
import Clock from '../components/clock'
import Counter from '../components/counter'
import Nav from '../components/nav'
import { initializeStore } from '../store'

export default function IndexPage() {
  const dispatch = useDispatch()

  // Tick the time every second
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
  const reduxStore = initializeStore()
  const { dispatch } = reduxStore

  dispatch({
    type: 'TICK',
    light: false,
    lastUpdate: Date.now(),
  })

  return { props: { initialReduxState: reduxStore.getState() } }
}
