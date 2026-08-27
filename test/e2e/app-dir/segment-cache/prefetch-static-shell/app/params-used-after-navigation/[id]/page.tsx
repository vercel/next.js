import { unstable_navigation as navigation } from 'next/cache'
import { Suspense } from 'react'

type Props = { params: Promise<{ id: string }> }

export default async function Page(props: Props) {
  return (
    <main>
      <p id="page-content">Params awaited after navigation</p>
      <Suspense
        fallback={<p id="navigation-loading">Loading navigation content...</p>}
      >
        <NavigationOnly {...props} />
      </Suspense>
    </main>
  )
}

async function NavigationOnly(props: Props) {
  // navigation() does not resolve in runtime prefetches, so awaiting `params`
  // after `navigation` should not deopt this page to using runtime requests
  // (because runtime shells/prefetches would not provide more data)
  await navigation()

  return (
    <>
      <div id="navigation-content">Navigation content</div>
      <ParamsDependent {...props} />
    </>
  )
}

async function ParamsDependent(props: Props) {
  const { id } = await props.params
  return <p id="param-value">Post: {id}</p>
}
