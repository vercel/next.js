import type { RootState } from '../store/store'
import { useSelector, useDispatch } from 'react-redux'
import { add } from '../store/counterSlice'

export default function AddCount() {
  const count = useSelector((state: RootState) => state.counter.count)
  const dispatch = useDispatch()

  return (
    <div>
      <style jsx>{`
        div {
          padding: 0 0 20px 0;
        }
      `}</style>
      <h1>
        AddCount: <span>{count}</span>
      </h1>
      <button onClick={() => dispatch(add())}>Add To Count</button>
    </div>
  )
}
