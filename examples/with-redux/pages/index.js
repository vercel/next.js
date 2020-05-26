import { useDispatch } from 'react-redux'
import { withRedux } from '../lib/redux'
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

// The initial time returned here will be 00:00:00.
export default withRedux(IndexPage)
