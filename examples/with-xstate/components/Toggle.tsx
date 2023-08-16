import { useMachine } from '@xstate/react'
import { toggleMachine } from '../machines/toggle'

export default function Toggle() {
  const [current, send] = useMachine(toggleMachine)
  return (
    <div>
      <h2>
        Toogle status: <span>{current.matches('active') ? 'On' : 'Off'}</span>
      </h2>
      <button onClick={() => send('TOGGLE')}>Toggle</button>
    </div>
  )
}
