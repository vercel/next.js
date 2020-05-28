import { useDispatch } from 'react-redux'
import useInterval from '../lib/useInterval'
import Clock from '../components/clock'
import Counter from '../components/counter'
import Nav from '../components/nav'

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

// If you build and start the app, the date returned here will have the same
// value for all requests, as this method gets executed at build time.
export function getStaticProps() {
  // Note that in this case we're returning the state directly, without
  // creating the store first (like in /pages/ssr.js), that's just to demonstrate
  // that it also works like this
  return {
    props: {
      initialReduxState: {
        lastUpdate: Date.now(),
        light: false,
      },
    },
  }
}
