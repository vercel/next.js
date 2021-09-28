import { useState } from 'react'

export default function Foo() {
  const [cnt, setCnt] = useState(0)

  return (
    <button onClick={() => setCnt(cnt + 1)}>
      On the client with state and HMR, Foo: {cnt}
    </button>
  )
}

export function Foo2() {
  const [cnt, setCnt] = useState(0)

  return <button onClick={() => setCnt(cnt + 1)}>Foo2: {cnt}</button>
}
