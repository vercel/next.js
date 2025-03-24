'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <div>
      <h1>Test Page</h1>
      <p id="base-path">{router.basePath}</p>
      <Link href="/another">Go to page 2</Link>
    </div>
  )
}
