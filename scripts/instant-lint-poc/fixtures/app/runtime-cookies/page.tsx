// Expect: BLOCKING (runtime data) — cookies() above content. Runtime data
// cannot be cached, so only the [stream] and [block] remedies apply.
import { cookies } from 'next/headers'
import { Suspense } from 'react'
import { Inbox } from './inbox'

export default async function Page() {
  const token = (await cookies()).get('token')
  return (
    <Suspense fallback="loading your inbox…">
      <Inbox token={token?.value} />
    </Suspense>
  )
}
