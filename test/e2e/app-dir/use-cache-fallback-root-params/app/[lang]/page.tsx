import { Suspense } from 'react'
import { lang } from 'next/root-params'

async function CachedLanguage() {
  'use cache'
  return <p id="cached-lang">{'locale:' + (await lang()).toUpperCase()}</p>
}

async function DirectLanguage() {
  return <p id="direct-lang">{await lang()}</p>
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p id="cached-pending">Cached language pending</p>}>
        <CachedLanguage />
      </Suspense>
      <Suspense fallback={<p id="direct-pending">Direct language pending</p>}>
        <DirectLanguage />
      </Suspense>
    </>
  )
}
