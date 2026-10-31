import { Suspense } from 'react'
import { draftMode } from 'next/headers'
import { connection } from 'next/server'

async function CachedTime() {
  'use cache'

  return <span id="time">{Date.now()}</span>
}

async function DraftStatus() {
  await connection()
  const { isEnabled } = await draftMode()

  return <p id="draft">{isEnabled ? 'draft-enabled' : 'draft-disabled'}</p>
}

export default function Page() {
  return (
    <main>
      <p>
        Cached at <CachedTime />
      </p>
      <Suspense fallback={<p id="draft">loading-draft</p>}>
        <DraftStatus />
      </Suspense>
    </main>
  )
}
