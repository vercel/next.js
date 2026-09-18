import { Suspense } from 'react'
import { lang } from 'next/root-params'

async function cachedLanguage() {
  'use cache'
  return (await lang()).toUpperCase()
}

async function NestedLanguage() {
  'use cache'
  return <p id="nested-lang">{'nested:' + (await cachedLanguage())}</p>
}

export default function Page() {
  return (
    <Suspense fallback={<p>nested language pending</p>}>
      <NestedLanguage />
    </Suspense>
  )
}
