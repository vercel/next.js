import React from 'react'
import HydrationMark from './ui/hydration-mark'

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        {children}
        <HydrationMark />
      </body>
    </html>
  )
}
