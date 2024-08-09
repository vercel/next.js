import React from 'react'
import { ReactNode } from 'react'

const magicNumber = Math.random()
const originalFetch = globalThis.fetch

globalThis.fetch = async (
  resource: URL | RequestInfo,
  options?: RequestInit
) => {
  const request = new Request(resource)

  if (request.url === 'http://fake.url/secret') {
    return new Response('monkey patching is fun')
  }

  if (request.url === 'http://fake.url/magic-number') {
    return new Response(magicNumber.toString())
  }

  return originalFetch(resource, options)
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
