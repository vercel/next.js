'use client'
import * as React from 'react'

export function Toggle() {
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    React.startTransition(() => {
      setShow(true)
    })
  }, [])

  return (
    <div>
      <button
        onClick={() => {
          React.startTransition(() => {
            setShow((show) => !show)
          })
        }}
      >
        {show ? 'A' : 'B'}
      </button>
      {show ? <div>hello</div> : <section>Loading</section>}
    </div>
  )
}
