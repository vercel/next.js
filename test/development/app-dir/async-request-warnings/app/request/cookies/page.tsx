import { cookies } from 'next/headers'

function Component() {
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  ;(cookies() as any).get('component')
  ;(cookies() as any).has('component')

  const allCookies = [...(cookies() as any)]
  return <pre>{JSON.stringify(allCookies, null, 2)}</pre>
}

export default function Page() {
  ;(cookies() as any).get('page')
  return (
    <>
      <Component />
      <Component />
    </>
  )
}
