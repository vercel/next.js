import ClientValue from './_components/client-value'
import { CACHE_TAG, getCachedValue } from './_lib/cached-value'

export default async function Page() {
  const value = await getCachedValue()

  return (
    <main>
      <p id="cached-value">{value}</p>
      <p id="cache-tag">{CACHE_TAG}</p>
      <ClientValue value={value} />
    </main>
  )
}
