import { connection } from 'next/server'
import { LinkAccordion } from '../../components/link-accordion'

export const dynamic = 'force-dynamic'

export default async function StalledPage() {
  await connection()
  return (
    <main>
      <h1 id="stalled-page-heading">Issue 98066 stalled page</h1>
      <LinkAccordion href="/other">Other page</LinkAccordion>
    </main>
  )
}
