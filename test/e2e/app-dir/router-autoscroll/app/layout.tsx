'use client'

import Link from 'next/link'
import React, { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    // @ts-ignore
    window.navigate = (path: string) => {
      router.push(path)
    }
  }, [router])

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
            position: 'fixed',
            top: 0,
            left: 0,
          }}
        >
          <Link id="to-vertical-page" href="1" />
        </div>
        {children}
      </body>
    </html>
  )
}
