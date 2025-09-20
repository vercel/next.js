import React from 'react'
import { notFound } from 'next/navigation'

export default function Layout({ children }: { children: React.ReactNode }) {
  notFound()
  return (
    <html>
      <body>
        <div id="layout">Layout Wrapper</div>
        {children}
      </body>
    </html>
  )
}
