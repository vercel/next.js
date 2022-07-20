import { useEffect, useState } from 'react'

export default function ClientComp() {
  const [state, setState] = useState({})
  useEffect(() => {
    setState({ test: 'HELLOOOO' })
  }, [])
  return (
    <>
      <p>Hello</p>
      {state.test}
    </>
  )
}
