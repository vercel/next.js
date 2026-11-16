import { randomUUID } from 'node:crypto'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('streamed cache revalidation', () => {
  const { next } = nextTestSetup({ files: __dirname })

  async function readValue(key: string): Promise<string> {
    const response = await next.fetch('/value/' + key)
    expect(response.status).toBe(200)
    return response.json()
  }
  async function prime(key: string) {
    const value = await readValue(key)
    expect(await readValue(key)).toBe(value)
    return value
  }

  it('invalidates a cached value from a streamed action that skips rendering', async () => {
    const key = randomUUID()
    const value = await prime(key)
    const browser = await next.browser('/action/' + key)
    await browser.elementById('action').click()
    await retry(async () =>
      expect(await browser.elementById('action').text()).toBe('finished')
    )
    await retry(async () => expect(await readValue(key)).not.toBe(value))
  })

  it('applies a tag invalidation queued during response streaming', async () => {
    const key = randomUUID()
    const value = await prime(key)
    const response = await next.fetch('/stream?key=' + key, { method: 'POST' })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(await response.text()).toBe('started\ninvalidated\n')
    await retry(async () => {
      expect(await readValue(key)).not.toBe(value)
    })
  })
})
