import { cookies } from 'next/headers'
import { getCachedValue, waitForForegroundCacheFill } from './data'
import { LinkAccordion } from '../../components/link-accordion'

export const prefetch = 'partial'

export default async function Page() {
  const cookieStore = await cookies()
  const key = cookieStore.get('key')?.value ?? 'rdc-default'
  const foregroundCacheKey =
    cookieStore.get('foregroundCacheKey')?.value ?? `${key}:foreground`
  const value = await getCachedValue(key)
  // This auxiliary cache read keeps the foreground pass open until the test
  // releases it. The final runtime prerender reuses the completed entry from
  // the RDC.
  await waitForForegroundCacheFill(foregroundCacheKey)
  return (
    <>
      <p id="rdc-value">{value}</p>
      <LinkAccordion href="/rdc/return" prefetch={false}>
        Leave cached page
      </LinkAccordion>
    </>
  )
}
