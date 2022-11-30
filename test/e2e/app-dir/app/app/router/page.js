'use client'

import { useRouter } from 'next/router'

export default function RouterPage() {
  // eslint-disable-next-line no-unused-vars
  const router = useRouter()

  return <div id="contents">You shouldn't see this</div>
}
