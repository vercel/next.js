'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
export default function Page() {
  const params = useParams()

  return (
    <div>
      <Link href="/foo">Link</Link>
      <div id="random">{Math.random()}</div>
      <div id="params">{JSON.stringify(params?.dynamic)}</div>
    </div>
  )
}
