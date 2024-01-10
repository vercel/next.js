import React from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head />
      <body>
        <React.Suspense fallback={<div>Loading...</div>}>
          {children}
        </React.Suspense>
      </body>
    </html>
  )
}
