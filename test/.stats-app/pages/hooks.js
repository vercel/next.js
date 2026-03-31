import React, { useState, useCallback } from 'react'

export default () => {
  const [clicks1, setClicks1] = React.useState(0)
  const [clicks2, setClicks2] = useState(0)

  const doClick1 = React.useCallback(() => {
    setClicks1(clicks1 + 1)
  }, [clicks1])

  const doClick2 = useCallback(() => {
    setClicks2(clicks2 + 1)
  }, [clicks2])

  return (
    <>
      <h3>Clicks {clicks1}</h3>
      <button onClick={doClick1}>Click me</button>

      <h3>Clicks {clicks2}</h3>
      <button onClick={doClick2}>Click me</button>
    </>
  )
}
