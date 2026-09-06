import { Suspense } from 'react'
import { cacheTag, updateTag } from 'next/cache'
import { UpdateButton } from './update-button'

const TAG = 'use-cache-private-update-tag'

// Mutable state, co-located with the cached function and the server action so
// they share the same module instance (and thus the same value) on the server.
let current = 'initial'

async function getPrivateValue() {
  'use cache: private'
  cacheTag(TAG)
  return current
}

async function updateValue() {
  'use server'
  current = 'updated'
  updateTag(TAG)
}

async function PrivateValue() {
  return <p id="value">{await getPrivateValue()}</p>
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p>Loading...</p>}>
        <PrivateValue />
      </Suspense>
      <UpdateButton action={updateValue} />
    </>
  )
}
