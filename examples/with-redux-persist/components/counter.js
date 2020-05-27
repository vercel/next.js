import { useSelector, useDispatch } from 'react-redux'
import { incrementCount, decrementCount, resetCount } from '../store'

const Counter = () => {
  const counter = useSelector((state) => state.count)
  const dispatch = useDispatch()

  return (
    <div>
      <h1>
        Count: <span>{counter}</span>
      </h1>
      <button onClick={() => dispatch(incrementCount())}>+1</button>
      <button onClick={() => dispatch(decrementCount())}>-1</button>
      <button onClick={() => dispatch(resetCount())}>Reset</button>
    </div>
  )
}

export default Counter
