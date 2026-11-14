import { nextTestSetup } from 'e2e-utils'
import { getDistDir, retry } from 'next-test-utils'

// @force-gate turbopack
describe('use-cache-durable', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('accepts inline and module-level durable functions in dev', async () => {
    const response = await next.fetch('/')
    expect(response.status).toBe(200)

    const browser = await next.browser('/')
    expect(await browser.elementById('inline-value').text()).toBe(
      'inline durable value'
    )
    expect(await browser.elementById('module-value').text()).toBe(
      'module durable value'
    )

    await browser.elementById('read-module-value').click()
    await retry(async () => {
      expect(await browser.elementById('client-value').text()).toBe(
        'module durable value'
      )
    })
  })

  it('does not generate durability metadata in dev', async () => {
    const $ = await next.render$('/')
    expect($('#inline-value').text()).toBe('inline durable value')
    expect($('#module-value').text()).toBe('module durable value')

    const manifest = await next.readJSON(
      `${getDistDir()}/server/server-reference-manifest.json`
    )
    const workers = Object.values<any>(manifest.node).flatMap((entry) =>
      Object.values<any>(entry.workers)
    )
    expect(workers.length).toBeGreaterThan(0)
    for (const worker of workers) {
      expect(worker.durability).toBeUndefined()
    }
  })
})
