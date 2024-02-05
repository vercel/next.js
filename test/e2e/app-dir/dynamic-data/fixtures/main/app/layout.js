import { Suspense } from 'react'

export default async function Layout({ children }) {
  const { __TEST_SENTINEL } = process.env
  return (
    <html lang="en">
      <head>
        <title>app-dynamic-data</title>
      </head>
      <body>
        <p>
          This test fixture helps us assert that accessing dynamic data in
          various scopes and with various `dynamic` configurations works as
          intended
        </p>
        <main>
          <div id="layout">{__TEST_SENTINEL}</div>
          <Suspense fallback={<div id="boundary">loading...</div>}>
            {children}
          </Suspense>
        </main>
      </body>
    </html>
  )
}
