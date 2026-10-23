import { getCachedValue, waitForForegroundCacheFill } from './data'

export async function ValidationPage({ variant }: { variant: string }) {
  // The new cache entry for each page forces a separate dev validation render.
  // The test holds its response until background revalidation starts.
  const [value] = await Promise.all([
    getCachedValue('rdc-validation'),
    waitForForegroundCacheFill(`rdc-${variant}`),
  ])
  console.log(`RDC validation ${variant}: ${value}`)
  return <p id="rdc-value">{value}</p>
}
