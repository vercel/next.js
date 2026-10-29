import Link from 'next/link'
import { draftMode } from 'next/headers'
import Counter from './counter'

export default async function Page() {
  const { isEnabled } = await draftMode()
  return (
    <>
      <p id="rendered-at">{Date.now()}</p>
      <p id="draft">{String(isEnabled)}</p>
      <Counter />
      <Link href="/dynamic">Dynamic page</Link>
    </>
  )
}
