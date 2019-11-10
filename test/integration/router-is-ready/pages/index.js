import { useRouter } from 'next/router'
import React from 'react'

export default () => {
  const { query, isReady } = useRouter()
  return (
    <>
      <pre id="isReady">{`ready: ${isReady}`}</pre>
      {isReady ? <pre id="test">query: {query.test}</pre> : null}
    </>
  )
}
