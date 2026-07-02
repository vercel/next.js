'use client'

import { useEffect, useState } from 'react'

export default function Page() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    import(/* turbopackChunkName: "my-widget" */ './widget').then((mod) =>
      setMessage(mod.default)
    )
  }, [])

  return (
    <main>
      <p>hello world</p>
      <p id="widget">{message}</p>
    </main>
  )
}
