import { updateTag, cacheTag, cacheLife } from 'next/cache'

async function getCachedTimestamp() {
  'use cache'
  cacheTag('eager-test')
  cacheLife('max')
  return Date.now().toString()
}

export default async function Page() {
  const timestamp = await getCachedTimestamp()
  return (
    <div>
      <p id="timestamp">{timestamp}</p>
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
