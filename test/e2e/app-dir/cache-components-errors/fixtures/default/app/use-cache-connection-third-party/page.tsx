import { CachedConnectionCaller } from 'third-party-pkg'

export default async function Page() {
  return (
    <>
      <p>
        This page calls `connection()` in `'use cache'` from third-party code,
        which triggers an error.
      </p>
      <CachedConnectionCaller />
    </>
  )
}
