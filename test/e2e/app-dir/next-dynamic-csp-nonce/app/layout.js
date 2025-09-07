import { headers } from 'next/headers'
import { Suspense } from 'react'

async function CSPMetatag({ children }) {
  const resolvedHeaders = await headers()
  const nonce = resolvedHeaders.get('x-nonce') || 'test-nonce'

  return (
    <meta
      httpEquiv="Content-Security-Policy"
      content={`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'`}
    />
  )
}

export default async function RootLayout({ children }) {
  return (
    <html>
      <Suspense>
        <head>
          <CSPMetatag />
        </head>
        <body>
          <div id="csp-nonce-test">{children}</div>
        </body>
      </Suspense>
    </html>
  )
}
