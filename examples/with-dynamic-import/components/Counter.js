import React, { useState } from 'react'

const Counter = () => {
  const [count, setCount] = useState(0)
  return (
    <div>
      <p>Count is: {count}</p>
      <button onClick={() => setCount(prevCount => prevCount + 1)}>Add</button>
    </div>
  )
}

export default Counter
