'use client'

import { useState } from 'react'

export function Client({ loadUserInfo }) {
  const [userInfo, setUserInfo] = useState(null)

  return (
    <div>
      <button
        onClick={async () => {
          setUserInfo(await loadUserInfo('Shu'))
        }}
      >
        Load user info
      </button>
      <button
        onClick={async () => {
          setUserInfo(await loadUserInfo('hey'))
        }}
      >
        Load wrong user info
      </button>
      {userInfo}
    </div>
  )
}

export function Counter({ initial }) {
  const [count, setCount] = useState(initial)

  return (
    <div>
      <button onClick={() => setCount(count + 1)}>+</button>
      <button onClick={() => setCount(count - 1)}>-</button>
      <div>Count: {count}</div>
    </div>
  )
}
