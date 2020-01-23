import { useState } from 'react'
export default () => {
  const [count, setCount] = useState(0)
  if (count === 5) {
    throw Error('Client Error 5 - render Error')
  }
  return (
    <div>
      <h2>
        Count: <span style={{ color: 'blue' }}>{count}</span>
      </h2>
      <button onClick={() => setCount(count => (count += 1))}>Add Count</button>
    </div>
  )
}
