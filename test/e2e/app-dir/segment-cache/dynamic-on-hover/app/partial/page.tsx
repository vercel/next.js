import { Suspense } from 'react'
import { navigation } from 'next/cache'
import { cookies } from 'next/headers'
import { connection } from 'next/server'

export const prefetch = 'partial'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p id="navigation-loading">Loading navigation...</p>}>
        <Navigation />
      </Suspense>
      <Suspense fallback={<p id="dynamic-loading">Loading dynamic data...</p>}>
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function Navigation() {
  // Reading cookies means only a runtime prefetch includes this content, and
  // navigation() means only a prefetch of the navigation stage does.
  await cookies()
  await navigation()
  return <p id="navigation-content">Navigation content on partial page</p>
}

async function Dynamic() {
  await connection()
  return <p id="dynamic-content">Dynamic content on partial page</p>
}
