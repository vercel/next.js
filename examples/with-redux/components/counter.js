import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { incrementCount, decrementCount, resetCount } from '../store'

const countSelector = state => state.count

const useCounter = () => {
  const dispatch = useDispatch()
  const increment = () => {
    dispatch(incrementCount())
  }
  const decrement = () => {
    dispatch(decrementCount())
  }
  const reset = () => {
    dispatch(resetCount())
  }

  return { increment, decrement, reset }
}

function Counter () {
  const count = useSelector(countSelector)
  const { increment, decrement, reset } = useCounter()
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
