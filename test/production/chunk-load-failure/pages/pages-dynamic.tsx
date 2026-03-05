import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Suspense } from 'react'

const PagesAsync = dynamic(() => import('../components/pages-async'), {
  ssr: false,
})

export default function PagesDynamic() {
  return (
    <>
      <Link href="/pages-other" id="to-pages-other" prefetch={false}>
        to pages other
      </Link>
      <Suspense fallback={<div>Loading...</div>}>
        <PagesAsync />
      </Suspense>
    </>
  )
}
