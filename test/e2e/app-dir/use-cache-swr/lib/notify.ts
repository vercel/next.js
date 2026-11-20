import { get } from 'node:http'

export function notify(key: string): Promise<void> {
  const url = process.env.TEST_DATA_SERVICE_URL
  if (url === undefined) {
    return Promise.resolve()
  }

  // Test coordination bypasses patched fetch so events are not cached or
  // deferred by the render stage that the test controls.
  return new Promise((resolve, reject) => {
    get(`${url}?key=${encodeURIComponent(key)}`, (response) => {
      response.resume()
      response.on('end', resolve)
      response.on('error', reject)
    }).on('error', reject)
  })
}
