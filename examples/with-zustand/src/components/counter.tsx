'use client'

import { useStore } from '../lib/store'

const useCounter = () => {
  return useStore((store) => ({
    count: store.count,
    increment: store.increment,
    decrement: store.decrement,
    reset: store.reset,
  }))
}

const Counter = () => {
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

export default Counter
