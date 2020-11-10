import useInterval from '../lib/useInterval'
import Clock from './clock'
import Counter from './counter'
import Nav from './nav'
import { useStore } from '../lib/zustandProvider'

export default function Page() {
  const { tick } = useStore()

  // Tick the time every second
  useInterval(() => {
    tick(Date.now(), true)
  }, 1000)

  return (
    <>
      <Nav />
      <Clock />
      <Counter />
    </>
  )
}
