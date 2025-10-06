import { unstable_expireTag, unstable_cache } from 'next/cache'
import { getUncachedRandomData } from '../no-store-fn'
import { RevalidateButton } from '../revalidate-button'

export default async function Page() {
  async function revalidate() {
    'use server'
    await unstable_expireTag('no-store-fn')
  }

  const cachedData = await unstable_cache(
    async () => {
      return getUncachedRandomData()
    },
    ['random'],
    {
      tags: ['no-store-fn'],
    }
  )()

  return (
    <div>
      <p>random: {Math.random()}</p>
      <p id="data">cachedData: {cachedData.random}</p>
      <RevalidateButton onClick={revalidate} />
    </div>
  )
}
