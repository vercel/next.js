import React from 'react'

export const revalidate = 0

let value = 0
export default function Layout({ children }) {
  return (
    <html>
      <head></head>
      <body>
        <div id="render-once">{children}</div>
        <p id="counter">{value++}</p>
      </body>
    </html>
  )
}
