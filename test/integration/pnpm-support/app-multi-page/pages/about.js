import React, { useEffect, useState } from 'react'

// Include react-dom to verify that webpack's `splitChunks` works correctly,
// and client-side JS still executes as expected.
// See https://github.com/vercel/next.js/issues/20884
import 'react-dom'

const IndexPage = () => {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setLoaded(true)
  }, [])

  return <h1>Hello {loaded && <span id="world">World</span>}</h1>
}

export default IndexPage
