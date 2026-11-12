import { nextTestSetup } from 'e2e-utils'

describe.each([
  ['child processes', false],
  ['worker threads', true],
])('static-generation-adaptive (%s)', (_name, workerThreads) => {
  const { next } = nextTestSetup({
    files: __dirname,
    nextConfig: {
      experimental: {
        staticGenerationAdaptive: true,
        cpus: 2,
        workerThreads,
      },
    },
  })

  it('prerenders every page with the right content', async () => {
    const manifest = JSON.parse(
      await next.readFile('.next/prerender-manifest.json')
    )
    for (let i = 0; i < 60; i++) {
      expect(manifest.routes[`/items/${i}`]).toBeDefined()
    }
    for (const id of ['0', '39', '40', '59']) {
      const $ = await next.render$(`/items/${id}`)
      expect($('#item').text()).toBe(`item ${id}`)
    }
  })

  it('retries a page that crashed its worker', async () => {
    const $ = await next.render$('/crash-once')
    expect($('#crash-once').text()).toBe('survived')
    if (!workerThreads) {
      expect(next.cliOutput).toContain(
        'Next.js build worker exited with code: null and signal: SIGKILL'
      )
      expect(next.cliOutput).toMatch(
        /Retrying \d+ page\(s\) from a crashed build worker one at a time: .*\/crash-once/
      )
    }
  })
})
