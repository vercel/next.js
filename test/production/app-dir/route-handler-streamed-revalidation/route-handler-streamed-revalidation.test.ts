import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const UPDATE_TAGS = 'StreamedRevalidationCacheHandler::updateTags'

describe.each([
  { mode: 'default', env: {} },
  // Without a platform `waitUntil`, `sendResponse` awaits `pendingWaitUntil`
  // before ending the response.
  { mode: 'minimal', env: { NEXT_PRIVATE_MINIMAL_MODE: '1' } },
])('route handler streamed revalidation ($mode)', ({ env }) => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    env,
  })

  if (skipped) return

  it('applies revalidations queued while the response body streams', async () => {
    const outputIndex = next.cliOutput.length

    const res = await next.fetch('/late', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('started\ndone\n')

    await retry(async () => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain(UPDATE_TAGS)
      expect(output).toContain('late-tag')
    })
  })

  it('applies revalidations queued before the handler returns', async () => {
    const outputIndex = next.cliOutput.length

    const res = await next.fetch('/early', { method: 'POST' })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')

    await retry(async () => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain(UPDATE_TAGS)
      expect(output).toContain('early-tag')
    })
  })

  it('applies revalidations and keeps serving when the client aborts mid-stream', async () => {
    const outputIndex = next.cliOutput.length

    const controller = new AbortController()
    const res = await next.fetch('/abort', {
      method: 'POST',
      signal: controller.signal,
    })
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    await reader.read()
    controller.abort()

    await retry(async () => {
      const output = next.cliOutput.slice(outputIndex)
      expect(output).toContain(UPDATE_TAGS)
      expect(output).toContain('abort-tag')
    })

    const followUp = await next.fetch('/early', { method: 'POST' })
    expect(followUp.status).toBe(200)
    expect(await followUp.text()).toBe('ok')
  })
})
