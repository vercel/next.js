import { headers } from 'next/headers'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses headers synchronously. This triggers a type error. In
        dev mode, we also log an explicit error that `headers()` should be
        awaited.
      </p>
      <HeadersReadingComponent />
    </>
  )
}

async function HeadersReadingComponent() {
  // Cast to any as we removed UnsafeUnwrapped types, but still need to test with the sync access
  const userAgent = (headers() as any).get('user-agent')
  return (
    <div>
      this component reads the `user-agent` header synchronously: {userAgent}
    </div>
  )
}
