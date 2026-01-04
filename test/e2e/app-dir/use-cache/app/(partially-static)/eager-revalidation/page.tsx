import { updateTag, cacheTag, cacheLife } from 'next/cache'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-test')
  cacheLife('max')
  return Date.now().toString()
}

export default async function Page() {
  const timestamp = await getCachedTimestamp()
  // This timestamp is NOT cached - it changes on every render.
  // Used to verify HTML cache hits vs re-renders.
  const renderTimestamp = Date.now().toString()
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
