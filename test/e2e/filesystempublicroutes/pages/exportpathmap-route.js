import { useEffect } from 'react'
import { useState } from 'react'
export default function ExportPathMapRoute() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  return (
    <div>
      <h1>exportpathmap was here</h1>
      {mounted ? <div id="page-was-loaded">Hello World</div> : null}
    </div>
  )
}
