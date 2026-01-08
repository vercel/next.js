import { revalidateTag, cacheTag, cacheLife } from 'next/cache'

async function getCachedRandomNumber() {
  'use cache'
  cacheTag('revalidate-tag-test')
  cacheLife('max')

  // This should change on each cache refresh
  return Math.random().toString()
}

export default async function Page() {
  const randomNumber = await getCachedRandomNumber()

  return (
    <div>
      <p id="random">{randomNumber}</p>
      <form>
        <button
          id="revalidate-tag-with-profile"
          formAction={async () => {
            'use server'
            // This should NOT cause immediate client refresh
            // The client should continue showing stale data
            // Fresh data should only appear on next navigation/refresh
            revalidateTag('revalidate-tag-test', 'max')
          }}
        >
          Revalidate Tag (background)
        </button>
      </form>
    </div>
  )
}
