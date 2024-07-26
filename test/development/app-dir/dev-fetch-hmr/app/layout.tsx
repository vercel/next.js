import React from 'react'
import { ReactNode } from 'react'

const magicNumber = Math.random()
const originalFetch = globalThis.fetch

console.log('monkey patching fetch')

// @ts-ignore
globalThis.fetch = async (
  resource: URL | RequestInfo,
  options?: RequestInit
) => {
  let url: string
  if (typeof resource === 'string') {
    url = resource
  } else {
    url = resource instanceof URL ? resource.href : resource.url
  }

  if (url === 'http://fake.url/secret') {
    return new Response('monkey patching is fun')
  }

  if (url === 'http://fake.url/magic-number') {
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
