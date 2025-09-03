'use client'

const isServer = typeof window === 'undefined'

export default function Root({ children }) {
  return (
    <html {...(isServer ? { className: 'server-html' } : undefined)}>
      <body>{children}</body>
    </html>
  )
}
