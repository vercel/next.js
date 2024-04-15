'use client'
import { useEffect, useState } from 'react'

export default function Page() {
  const [data, setData] = useState(null)
  const [updated, setUpdated] = useState(false)
  useEffect(() => {
    setData(window.history.state.myData)
  }, [])
  return (
    <>
      <h1 id="replacestate-data">ReplaceState Data</h1>
      {updated ? <div id="state-updated"></div> : null}
      <pre id="my-data">{JSON.stringify(data)}</pre>
      <button
        onClick={() => {
          setData(window.history.state.myData)
        }}
        id="get-latest"
      >
        Get latest data
      </button>
      <button
        onClick={() => {
          window.history.replaceState({ myData: { foo: 'bar' } }, '')
          setUpdated(true)
        }}
        id="replace-state"
      >
        Replace state
      </button>
    </>
  )
}
