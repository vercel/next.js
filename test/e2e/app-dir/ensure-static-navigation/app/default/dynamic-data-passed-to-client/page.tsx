import { Suspense } from 'react'
import { UseServerData } from './client'
import { connection } from 'next/server'

export const ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Suspense fallback={<p>Loading...</p>}>
        <UseServerData serverData={connection().then(() => 'Dynamic data')} />
      </Suspense>
    </main>
  )
}
