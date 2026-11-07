import { type ReactNode, Suspense } from 'react'
import { cookies } from 'next/headers'

// Reading a cookie in the root layout makes every page of the app dynamic,
// the not-found page included: none of them has a cache entry.
async function Theme() {
  const theme = (await cookies()).get('theme')?.value ?? 'light'

  return <p id="theme">{theme}</p>
}

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <Suspense>
          <Theme />
          {children}
        </Suspense>
      </body>
    </html>
  )
}
