// The cache body hangs on a promise that is NOT tied to outer-scope module
// state. The probe will hang in isolation just like the main render does;
// the outer cache fill should fall through to the regular `UseCacheTimeoutError`
// at the configured `useCacheTimeout`.
async function getCachedData(): Promise<string> {
  'use cache'

  // Intentionally never resolves; not dependent on module scope.
  await new Promise(() => {})
  return 'unreachable'
}

async function Cached() {
  try {
    const data = await getCachedData()
    return <p id="result">{data}</p>
  } catch (error: any) {
    return <p id="result">Error: {error.message}</p>
  }
}

export default function Page() {
  return <Cached />
}
