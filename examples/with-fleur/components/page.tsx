import { useFleurContext } from '@fleur/react'
import { TimerOps } from '../domains/timer'
import { useInterval } from '../lib/useInterval'
import { Clock } from './clock'
import { Counter } from './counter'
import { Nav } from './nav'

export function Page() {
  const { executeOperation } = useFleurContext()

  // Tick the time every second
  useInterval(() => {
    executeOperation(TimerOps.tick, { light: true, lastUpdate: Date.now() })
  }, 1000)

  return (
    <>
      <Nav />
      <Clock />
      <Counter />
    </>
  )
}
