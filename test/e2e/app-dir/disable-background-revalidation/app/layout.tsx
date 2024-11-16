import React from 'react'

export const revalidate = 1;

export default function Layout({ children }) {
  return (
    <html>
      <head>
        <title>Disable Background Revalidation</title>
      </head>
      <body>{children}</body>
    </html>
  )
}
