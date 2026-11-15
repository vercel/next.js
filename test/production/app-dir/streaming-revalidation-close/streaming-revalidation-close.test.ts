import { randomUUID } from 'node:crypto'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// The custom server exposes the platform's pending promises and gates cache
// I/O. Deploy coverage uses the separate streaming revalidation e2e fixtures.
// @force-gate !deploy
describe('streaming revalidation at response close', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    startCommand: 'node server.mjs',
    serverReadyPattern: /Revalidation server ready/,
    forcedPort: 'random',
  })

  async function control(command: {
    create?: string[]
    release?: string[]
    stale?: boolean
  }) {
    await next.fetch('/_test/control', {
      method: 'POST',
      body: JSON.stringify(command),
    })
  }

  async function readState(): Promise<{
    events: string[]
    requests: {
      url: string
      pending: number
      finished: boolean
      handled: boolean
    }[]
  }> {
    return (await next.fetch('/_test/state')).json()
  }

  it('keeps regeneration started after the HTML shell alive after the response ends', async () => {
    const key = randomUUID()
    const warmPath = `/cache/${key}/warm`
    const initialValue = (await next.render$(warmPath))('#value').text()
    expect(initialValue).toContain(key)
    await retry(async () => {
      const state = await readState()
      expect(state.events).toContain('written:' + key)
      expect(
        state.requests.find((request) => request.url === warmPath)?.pending
      ).toBe(0)
    })

    // Block the cache read until the shell streams. Block regeneration
    // separately so it can remain pending after the response ends.
    await control({ stale: true, create: ['read:' + key, 'generation:' + key] })
    try {
      const path = `/cache/${key}/stale`
      const response = await next.fetch(path)
      const reader = response.body!.getReader()
      const decoder = new TextDecoder()
      let html = ''
      while (!html.includes('Request:')) {
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)
        html += decoder.decode(chunk.value)
      }
      await control({ release: ['read:' + key] })
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }
        html += decoder.decode(chunk.value)
      }
      expect(html).toContain(initialValue)
      await retry(async () => {
        expect(
          (await readState()).requests.find((request) => request.url === path)
            ?.handled
        ).toBe(true)
      })
      const state = await readState()
      // The warmup generation finished. The stale request started a second
      // generation, which is still blocked.
      expect(
        state.events.filter((event) => event === 'generation-started:' + key)
      ).toHaveLength(2)
      expect(
        state.events.filter((event) => event === 'generation-finished:' + key)
      ).toHaveLength(1)
      const request = state.requests.find((request) => request.url === path)!
      expect(request.finished).toBe(true)
      // The response and handler have finished, but waitUntil must still track
      // the blocked regeneration.
      expect(request.pending).toBeGreaterThan(0)
    } finally {
      await control({
        stale: false,
        release: ['read:' + key, 'generation:' + key],
      })
      await retry(async () => {
        expect(
          (await readState()).events.filter(
            (event) => event === 'written:' + key
          )
        ).toHaveLength(2)
      })
    }
  })
})
