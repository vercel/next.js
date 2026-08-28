import { Suspense } from 'react'
import { lang } from 'next/root-params'
import { connection } from 'next/server'

export const instant = { level: 'experimental-error' }

export default async function Page() {
  return (
    <main>
      <p>
        Root params are allowed in app shells, so we don't need a suspense
        around them.
      </p>
      <ReadRootParam />
      <ReadRootParamInCache />
      <Suspense fallback="Loading dynamic content...">
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function ReadRootParam() {
  const currentLang = await lang()
  return <div>{`Lang in page: ${currentLang}`}</div>
}

async function ReadRootParamInCache() {
  'use cache'
  const currentLang = await lang()
  return <div>{`Lang in cache: ${currentLang}`}</div>
}

async function Dynamic() {
  await connection()
  return 'Dynamic content'
}
