import { useEffect, useLayoutEffect, useMemo } from 'react'
import * as React from 'react'

export default function App() {
  useEffect(() => {
    console.log('Hello World')
  }, [])

  useLayoutEffect(() => {
    function foo() {}
    return () => {}
  }, [1, 2, App])

  useLayoutEffect(() => {}, [runSideEffect()])
  useEffect(() => {}, [1, runSideEffect(), 2])
  useEffect(() => {}, getArray())

  const a = useMemo(() => {
    return 1
  }, [])

  React.useEffect(() => {
    console.log('Hello World')
  })

  return (
    <div>
      <h1>Hello World</h1>
    </div>
  )
}
