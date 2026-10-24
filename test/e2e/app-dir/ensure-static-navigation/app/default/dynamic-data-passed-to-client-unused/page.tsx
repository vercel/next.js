import { Suspense } from 'react'
import { UserServerDataOnlyInBrowser } from './client'
import { connection } from 'next/server'

export const ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <UserServerDataOnlyInBrowser
          serverData={connection().then(() => 'Dynamic data')}
        />
      </Suspense>
    </main>
  )
}
