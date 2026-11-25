import React from 'react'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
      </head>
      <body>{children}</body>
    </html>
  )
}
