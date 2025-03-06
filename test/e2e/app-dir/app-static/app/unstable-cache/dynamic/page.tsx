import { unstable_expireTag, unstable_cache } from 'next/cache'
import { RevalidateButton } from '../revalidate-button'

export const dynamic = 'force-dynamic'

export default async function Page() {
  async function revalidate() {
    'use server'
    await unstable_expireTag('random-value-data')
  }

  const cachedData = await unstable_cache(
    async () => {
      return {
        random: Math.random(),
      }
    },
    ['random-value'],
    {
      tags: ['random-value-data'],
    }
  )()

  return (
    <div>
      <p>random: {Math.random()}</p>
      <p id="cached-data">cachedData: {cachedData.random}</p>
      <RevalidateButton onClick={revalidate} />
    </div>
  )
}
