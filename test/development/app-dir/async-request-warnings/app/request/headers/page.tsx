import { headers, type UnsafeUnwrappedHeaders } from 'next/headers'

function Component() {
  ;(headers() as unknown as UnsafeUnwrappedHeaders).get('component')
  ;(headers() as unknown as UnsafeUnwrappedHeaders).has('component')

  const allHeaders = [...(headers() as unknown as UnsafeUnwrappedHeaders)]
  return <pre>{JSON.stringify(allHeaders, null, 2)}</pre>
}

export default function Page() {
  ;(headers() as unknown as UnsafeUnwrappedHeaders).get('page')
  return (
    <>
      <Component />
      <Component />
    </>
  )
}
