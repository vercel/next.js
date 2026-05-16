import React from 'react'

export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <div id="root-a">{children}</div>
      </body>
    </html>
  )
}
