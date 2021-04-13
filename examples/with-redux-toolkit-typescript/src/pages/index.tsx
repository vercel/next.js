import { useAppDispatch, useInterval } from '../app/hooks'
import Clock from '../features/clock/Clock'
import { tick } from '../features/clock/clockSlice'
import Counter from '../features/counter/Counter'

const IndexPage = () => {
  const dispatch = useAppDispatch()
  // Tick the time every second
  useInterval(() => {
    dispatch(tick({ light: true, lastUpdate: Date.now() }))
  }, 1000)

  return (
    <>
      <Clock />
      <Counter />
    </>
  )
}

export default IndexPage
