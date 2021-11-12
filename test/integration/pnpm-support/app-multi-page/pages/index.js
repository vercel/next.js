import React, { useEffect, useState } from 'react'

const IndexPage = () => {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    setLoaded(true)
  }, [])

  return <h1>Hello {loaded && <span id="world">World</span>}</h1>
}

export default IndexPage
