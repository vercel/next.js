import React from 'react'
import { useFleurContext, useStore } from '@fleur/react'
import { TimerOps, TimerSelector } from '../domains/timer'

const useCounter = () => {
  const { executeOperation } = useFleurContext()
  const count = useStore(TimerSelector.getCount)

  const increment = () => executeOperation(TimerOps.increment)
  const decrement = () => executeOperation(TimerOps.decrement)
  const reset = () => executeOperation(TimerOps.reset)

  return { count, increment, decrement, reset }
}

export const Counter = () => {
  const { count, increment, decrement, reset } = useCounter()

  return (
    <div>
      <h1>
        Count: <span>{count}</span>
      </h1>
      <button onClick={increment}>+1</button>
      <button onClick={decrement}>-1</button>
      <button onClick={reset}>Reset</button>
    </div>
  )
}
