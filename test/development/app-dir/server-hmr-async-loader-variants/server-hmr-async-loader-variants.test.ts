import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Server HMR is a Turbopack-only feature
// @force-gate turbopack
describe('server-hmr-async-loader-variants', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function evaluatedAt() {
    const $ = await next.render$('/')
    return $('#evaluated-at').text()
  }

  async function variantsValue() {
    const $ = await next.render$('/variants')
    return $('#value').text()
  }

  it('does not re-evaluate unrelated modules on requests to a route with async loader variants', async () => {
    const outputStart = next.cliOutput.length
    const initialEvaluatedAt = await evaluatedAt()

    for (let i = 0; i < 3; i++) {
      expect(await variantsValue()).toBe('dyn-v1:dep|wrap:dep:dyn-v1:dep')
    }

    expect(await evaluatedAt()).toBe(initialEvaluatedAt)
    expect(next.cliOutput.slice(outputStart)).not.toContain('[Server HMR]')
  })

  it('does not update routes with different async loader variants when alternating between them', async () => {
    const outputStart = next.cliOutput.length
    const render = async (path: string) => {
      const $ = await next.render$(path)
      return {
        value: $('#value').text(),
        evaluatedAt: $('#evaluated-at').text(),
      }
    }

    const direct = await render('/direct')
    const viaWrap = await render('/via-wrap')
    expect(direct.value).toBe('dyn-v1:dep')
    expect(viaWrap.value).toBe('wrap:dep:dyn-v1:dep')

    // An update of the async loader would re-evaluate the page that imports it.
    for (let i = 0; i < 3; i++) {
      expect(await render('/direct')).toEqual(direct)
      expect(await render('/via-wrap')).toEqual(viaWrap)
    }
    expect(next.cliOutput.slice(outputStart)).not.toContain('[Server HMR]')
  })

  it('updates a route with async loader variants', async () => {
    const outputStart = next.cliOutput.length
    const initialEvaluatedAt = await evaluatedAt()
    expect(await variantsValue()).toBe('dyn-v1:dep|wrap:dep:dyn-v1:dep')

    await next.patchFile('lib/dyn.ts', (content) =>
      content.replace('dyn-v1', 'dyn-v2')
    )
    await retry(async () => {
      expect(await variantsValue()).toBe('dyn-v2:dep|wrap:dep:dyn-v2:dep')
    })

    expect(await evaluatedAt()).toBe(initialEvaluatedAt)
    expect(next.cliOutput.slice(outputStart)).not.toContain('[Server HMR]')
  })
})
