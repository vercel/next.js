import { unstable_cache } from 'next/cache'
import Expire from '../expire'

const getValue = unstable_cache(
  async () => {
    const response = await fetch(
      'https://next-data-api-endpoint.vercel.app/api/random?data-cache-revalidation=unstable-cache',
      {
        cache: 'no-store',
      }
    )
    return response.text()
  },
  ['data-cache-revalidation:unstable-cache'],
  { revalidate: 3600 }
)

export default async function Page() {
  return (
    <>
      <Expire />
      <p id="value">{await getValue()}</p>
    </>
  )
}
