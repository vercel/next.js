import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

function Component() {
  ;(cookies() as unknown as UnsafeUnwrappedCookies).get('component')
  ;(cookies() as unknown as UnsafeUnwrappedCookies).has('component')

  const allCookies = [...(cookies() as unknown as UnsafeUnwrappedCookies)]
  return <pre>{JSON.stringify(allCookies, null, 2)}</pre>
}

export default function Page() {
  ;(cookies() as unknown as UnsafeUnwrappedCookies).get('page')
  return (
    <>
      <Component />
      <Component />
    </>
  )
}
