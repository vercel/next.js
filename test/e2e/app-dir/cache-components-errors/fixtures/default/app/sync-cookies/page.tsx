import { cookies } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses cookies synchronously. This triggers a type error. In
        dev mode, we also log an explicit error that `cookies()` should be
        awaited.
      </p>
      <CookiesReadingComponent />
    </>
  )
}

async function CookiesReadingComponent() {
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const token = (cookies() as any).get('token')

  return (
    <div>
      this component reads the `token` cookie synchronously: {token?.value}
    </div>
  )
}
