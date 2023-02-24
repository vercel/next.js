'use client'

import React, { useEffect } from 'react'
import { RouterEvents } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  // We export these so that we can access them from tests
  useEffect(() => {
    // @ts-ignore
    window.navigations = []

    RouterEvents.on('routeChangeStart', (url) => {
      // @ts-ignore
      window.navigations.push(url)
    })
  }, [])

  return (
    <html>
      <head></head>
      <body>{children}</body>
    </html>
  )
}
