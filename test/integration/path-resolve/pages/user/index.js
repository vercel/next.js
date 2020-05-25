import { useState, useEffect } from 'react'

export default function Page() {
  const [isMounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return (
    <div>
      {isMounted ? <div id="hydration-marker" /> : null}
      <div id="page-marker">/user/index.js</div>
    </div>
  )
}
