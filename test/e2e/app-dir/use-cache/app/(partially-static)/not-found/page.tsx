'use cache: remote'

import { notFound } from 'next/navigation'

export default async function Page() {
  notFound()

  return <p>This will never render</p>
}
