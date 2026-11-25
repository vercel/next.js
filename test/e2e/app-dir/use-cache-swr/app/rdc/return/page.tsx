import { connection } from 'next/server'
import { LinkAccordion } from '../../../components/link-accordion'

export default async function Page() {
  await connection()
  return (
    <>
      <h1>Return to cached page</h1>
      <LinkAccordion href="/rdc" prefetch={false}>
        Cached page
      </LinkAccordion>
    </>
  )
}
