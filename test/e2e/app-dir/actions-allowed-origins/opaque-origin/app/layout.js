import { Suspense } from 'react'

export default function RootLayout({ children }) {
  return (
    // Needs to be above html since we can't allow scripts in sandbox
    <Suspense fallback={<div>Loading...</div>}>
      <html>
        <head />
        <body>
          <ul>
            {/* These need to be MPAs so that the appropriate headers are applied */}
            <li>
              <a href="/sandboxed">Sandboxed Page</a>
            </li>
          </ul>
          {children}
        </body>
      </html>
    </Suspense>
  )
}
