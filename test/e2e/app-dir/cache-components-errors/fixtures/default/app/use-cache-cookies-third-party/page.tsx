import { CachedCookiesReader } from 'third-party-pkg'

export default async function Page() {
  return (
    <>
      <p>
        This page accesses `cookies()` in `'use cache'` from third-party code,
        which triggers an error.
      </p>
      <CachedCookiesReader />
    </>
  )
}
