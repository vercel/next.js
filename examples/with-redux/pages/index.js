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
      {/* The initial time returned here will be 00:00:00 */}
      <Clock />
      <Counter />
    </>
  )
}
