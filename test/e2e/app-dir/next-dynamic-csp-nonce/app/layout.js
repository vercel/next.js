import { headers } from 'next/headers'
import { Suspense } from 'react'

export default async function CSPLayout({ children }) {
  const resolvedHeaders = await headers()
  const nonce = resolvedHeaders.get('x-nonce') || 'test-nonce'

  return (
    <html>
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'`}
        />
      </head>
      <body>
        <div id="csp-nonce-test">
          <Suspense>{children}</Suspense>
        </div>
      </body>
    </html>
  )
}
