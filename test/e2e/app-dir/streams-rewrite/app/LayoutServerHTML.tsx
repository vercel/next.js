'use client'

import { useServerInsertedHTML } from 'next/navigation'

export default function LayoutServerHTML({ children }) {
  useServerInsertedHTML(() => {
    return <meta name="server" content="inserted layout" />
  })

  return children
}
