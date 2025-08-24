import { unstable_noStore } from 'next/cache'
import Link from 'next/link'
import { Suspense } from 'react'

function Dynamic() {
  unstable_noStore()
  return <div id="dynamic">Dynamic</div>
}

export default function Page() {
  return (
    <>
      <li>
        <Link href="/">Root</Link>
        <Link href="/enabled">Enabled</Link>
        <Link href="/disabled">Disabled</Link>
        <Link href="/static">Static</Link>
      </li>
      <Suspense fallback={<div id="fallback">Loading...</div>}>
        <Dynamic />
      </Suspense>
    </>
  )
}

export const slugs = ['a', 'b', 'c']

export const generateStaticParams = () => {
  return slugs.map((slug) => ({ slug }))
}
