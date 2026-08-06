import { headers } from 'next/headers'

function Component() {
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  ;(headers() as any).get('component')
  ;(headers() as any).has('component')

  const allHeaders = [...(headers() as any)]
  return <pre>{JSON.stringify(allHeaders, null, 2)}</pre>
}

export default function Page() {
  ;(headers() as any).get('page')
  return (
    <>
      <Component />
      <Component />
    </>
  )
}
