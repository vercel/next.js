import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// @force-gate turbopack
describe('turbopack-loader-module-state', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function value() {
    const $ = await next.render$('/')
    return $('#value').text()
  }

  // TODO: the reported dependency invalidates the evaluation, but a pooled worker that already
  // loaded the loader module keeps the value it read at module load.
  // @gate FIXME
  it('re-runs the loader with fresh module state when a file it read at module load changes', async () => {
    expect(await value()).toBe('v1')

    await next.patchFile('loaders/data.txt', 'v2\n', async () => {
      await retry(async () => {
        expect(await value()).toBe('v2')
      }, 15_000)
    })

    await retry(async () => {
      expect(await value()).toBe('v1')
    }, 15_000)
  })
})
