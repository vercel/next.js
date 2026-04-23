import { Suspense } from 'react'
import { SlugClient } from './slug-client'

export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default function Page() {
  return (
    <>
      <p>/isr-app/[slug]</p>
      <p>now: static</p>
      <Suspense fallback={<p>loading slug</p>}>
        <SlugClient />
      </Suspense>
    </>
  )
}
