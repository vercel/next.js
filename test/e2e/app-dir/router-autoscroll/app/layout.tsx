'use client'

import React, { startTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <html>
      <head></head>
      <body
        style={{
          margin: 0,
        }}
      >
        <div
          style={{
            // clicking link or button will scroll to the button and we don't want that in our test os they should be always visible
            position: 'fixed',
            top: 0,
            left: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Link id="link-page1" href="/page1">
            Link to page1
          </Link>
          <Link id="link-page2" href="/page2">
            Link to page2
          </Link>
          <button
            id="refresh"
            onClick={() => {
              router.refresh()
            }}
          >
            refresh
          </button>
          <button
            id="navigate-to-small-page"
            onClick={() => {
              startTransition(() => {
                router.push('/small-page')
                router.refresh()
              })
            }}
          >
            navigate to small-page and refresh
          </button>
        </div>
        <div
          style={{
            background: 'pink',
            padding: 10000,
          }}
        >
          {children}
        </div>
      </body>
    </html>
  )
}
