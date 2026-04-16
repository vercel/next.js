import { CachedDraftModeEnabler } from 'third-party-pkg'

export default async function Page() {
  return (
    <>
      <p>
        This page enables draft mode in `'use cache'` from third-party code,
        which triggers an error.
      </p>
      <CachedDraftModeEnabler />
    </>
  )
}
