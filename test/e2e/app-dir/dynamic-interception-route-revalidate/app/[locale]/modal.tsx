'use client'

import { useState } from 'react'
import { doAction } from './actions'

export default function Modal({ photoId }: { photoId: string }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<number>()

  async function handleClick() {
    setLoading(true)
    const result = await doAction()
    setLoading(false)
    setResult(result)
  }

  return (
    <>
      <h2>Photo Id: {photoId}</h2>

      <button onClick={handleClick}>Revalidate</button>
      {loading && <div id="loading">Loading...</div>}
      {result && <div id="result">Result: {result}</div>}
    </>
  )
}
