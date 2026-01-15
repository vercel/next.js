import { cookies } from 'next/headers'
import { LinkAccordion } from '../components/link-accordion'

export const staleTime = 180 // 3 minutes

export default async function Page() {
  // Access cookies to make the page dynamic
  await cookies()

  return (
    <>
      <div id="stale-time-dynamic">
        Dynamic page with export staleTime of 3 minutes [prefetch-sentinel]
      </div>
      <LinkAccordion href="/" id="to-home">
        To home
      </LinkAccordion>
    </>
  )
}
