'use client'

import { useServerInsertedHTML } from 'next/navigation'

export default function Client() {
  useServerInsertedHTML(() => {
    return <meta name="server" content="inserted" />
  })

  return <p>client world</p>
}
