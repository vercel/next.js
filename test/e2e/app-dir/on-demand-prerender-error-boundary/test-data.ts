import { getOrigin } from './origin'

export async function getData(key: string) {
  'use cache'

  // The HTTP boundary keeps the data tag out of the page's ISR entry.
  const response = await fetch(
    `${getOrigin()}/test-data?key=${encodeURIComponent(key)}`,
    { cache: 'no-store' }
  )
  if (!response.ok) {
    throw new Error(`Failed to read test data: ${response.status}`)
  }
  return response.text()
}

export async function getTransientData(pathname: string) {
  'use cache'

  const response = await fetch(
    `${getOrigin()}/test-data?key=${encodeURIComponent(pathname)}`,
    { method: 'PATCH', cache: 'no-store' }
  )
  if (!response.ok) {
    throw new Error(`Failed to read transient data: ${response.status}`)
  }
  if ((await response.text()) === 'error') {
    // The data source has prepared the next read to succeed. The failed cache
    // entry must be omitted from the resume data cache so this reader runs
    // again.
    throw new Error(`Transient prerender error: ${pathname}`)
  }
  return 'Recovered during resume'
}
