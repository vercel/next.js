import React from 'react'

export default function Layout({ children }: { children: React.ReactNode }) {
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
