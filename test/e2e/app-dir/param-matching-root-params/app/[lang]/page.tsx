import { Suspense } from 'react'
import { lang } from 'next/root-params'

async function CachedLanguage() {
  'use cache'
  const value = await lang()
  return <p id="cached-lang">{'locale:' + value.toUpperCase()}</p>
}

async function DirectLanguage() {
  const value = await lang()
  return (
    <p id="direct-lang" data-language={value}>
      {value}
    </p>
  )
}

export default function Page() {
  return (
    <>
      <Suspense fallback={<p>cached language pending</p>}>
        <CachedLanguage />
      </Suspense>
      <Suspense fallback={<p>direct language pending</p>}>
        <DirectLanguage />
      </Suspense>
    </>
  )
}
