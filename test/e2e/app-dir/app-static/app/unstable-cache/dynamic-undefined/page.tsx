import { updateTag, unstable_cache } from 'next/cache'
import { RevalidateButton } from '../revalidate-button'

export const dynamic = 'force-dynamic'

export default async function Page() {
  async function revalidate() {
    'use server'
    await updateTag('undefined-value-data')
  }

  const cachedData = await unstable_cache(
    async () => {
      return undefined as undefined
    },
    ['undefined-value'],
    {
      tags: ['undefined-value-data'],
    }
  )()

  return (
    <div>
      <p>random: {Math.random()}</p>
      <p id="cached-data">typeof cachedData: {typeof cachedData}</p>
      <RevalidateButton onClick={revalidate} />
    </div>
  )
}
