import React, { useState } from 'react'

import inc from '../libs/inc'

export function Counter(): JSX.Element {
  const [x, setX] = useState(0)
  return (
    <button id="counter" onClick={() => setX(inc(x))}>
      Counter: {x}
    </button>
  )
}
