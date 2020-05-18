import { createAction } from '@reduxjs/toolkit'
import { useSelector, useDispatch } from 'react-redux'

const useCounter = () => {
  const count = useSelector(state => state.count)
  const dispatch = useDispatch()
  const increment = () => dispatch(createAction('INCREMENT')())
  const decrement = () => dispatch(createAction('DECREMENT')())
  const reset = () => dispatch(createAction('RESET')())

  return { count, increment, decrement, reset }
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
