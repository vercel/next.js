'use client'

import { useEffect, useState } from 'react'

export default function WebpackRemotePage() {
  const [greeting, setGreeting] = useState('loading')

  useEffect(() => {
    let active = true

    import('webpackRemote/Greeting').then(
      (remote) => {
        if (active) setGreeting(remote.default())
      },
      (error: Error) => {
        if (active) setGreeting(`error: ${error.message}`)
      }
    )

    return () => {
      active = false
    }
  }, [])

  return <p id="webpack-greeting">{greeting}</p>
}
