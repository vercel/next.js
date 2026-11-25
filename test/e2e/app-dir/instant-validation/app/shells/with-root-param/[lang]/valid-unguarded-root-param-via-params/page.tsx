import { ComponentProps, Suspense } from 'react'
import { connection } from 'next/server'

export const instant = { level: 'experimental-error' }

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  return (
    <main>
      <p>
        Root params are allowed in app shells, and awaiting a `params` object in
        a segment that only has root params is allowed as well.
      </p>
      <ReadRootParamViaParams params={params} />
      <ReadRootParamViaParamsInCache params={params} />
      <Suspense fallback="Loading dynamic content...">
        <Dynamic />
      </Suspense>
    </main>
  )
}

async function ReadRootParamViaParams(props: ComponentProps<typeof Page>) {
  const { lang: currentLang } = await props.params
  return <div>{`Lang in page: ${currentLang}`}</div>
}

async function ReadRootParamViaParamsInCache(
  props: ComponentProps<typeof Page>
) {
  'use cache'
  const { lang: currentLang } = await props.params
  return <div>{`Lang in cache: ${currentLang}`}</div>
}

async function Dynamic() {
  await connection()
  return 'Dynamic content'
}
