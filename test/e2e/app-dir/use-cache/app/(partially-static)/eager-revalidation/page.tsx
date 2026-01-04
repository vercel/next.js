import { updateTag, cacheTag, cacheLife } from 'next/cache'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-test')
  cacheLife('max')
  return Date.now().toString()
}

async function getRenderTimestamp() {
  'use cache'
  // Same cacheTag as getCachedTimestamp - both get invalidated together.
  // If User B sees the same render timestamp as User A, it proves HTML cache hit.
  cacheTag('eager-test')
  cacheLife('max')
  return Date.now().toString()
}

export default async function Page() {
  const timestamp = await getCachedTimestamp()
  const renderTimestamp = await getRenderTimestamp()
  return (
    <div>
      <p id="timestamp">{timestamp}</p>
      <p id="render-timestamp">{renderTimestamp}</p>
      <form>
        <button
          id="update-tag"
          formAction={async () => {
            'use server'
            updateTag('eager-test')
          }}
        >
          Update Tag
        </button>
      </form>
    </div>
  )
}
