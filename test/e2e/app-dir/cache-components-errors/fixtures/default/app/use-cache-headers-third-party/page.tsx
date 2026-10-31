import { CachedHeadersReader } from 'third-party-pkg'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses `headers()` in `'use cache'` from third-party code,
        which triggers an error.
      </p>
      <CachedHeadersReader />
    </>
  )
}
