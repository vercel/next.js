// TODO: This should not need the suspense boundary in the root layout.
'use cache'

import { notFound } from 'next/navigation'

export default async function Page() {
  notFound()

  return <p>This will never render</p>
}
