import { draftMode } from 'next/headers'
import { updateTag, unstable_cache } from 'next/cache'
import { RevalidateButton } from '../revalidate-button'

export const dynamic = 'force-dynamic'

export default async function Page() {
  async function revalidate() {
    'use server'
    await updateTag('random-value-data')
  }

  const cachedData = await unstable_cache(
    async () => {
      return {
        random: Math.random(),
        draftModeEnabled: (await draftMode()).isEnabled,
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
      <p id="draft-mode-enabled">
        draft mode enabled: {cachedData.draftModeEnabled.toString()}
      </p>
      <RevalidateButton onClick={revalidate} />
    </div>
  )
}
