import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

const isoDateRegExp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const randomRegExp = /^\d+\.\d+$/

describe('use-cache-with-server-function-props', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to use inline server actions as props', async () => {
    const browser = await next.browser('/server-action')

    await browser.elementById('submit-button-hi').click()
    await retry(async () => {
      expect(await browser.elementById('hi').text()).toMatch('Hi, World!')
    })

    await browser.elementById('submit-button-hello').click()
    await retry(async () => {
      expect(await browser.elementById('hello').text()).toMatch('Hello, World!')
    })
  })

  it('should be able to use nested cache functions as props', async () => {
    const browser = await next.browser('/nested-cache')

    await browser.elementById('submit-button-date').click()
    await retry(async () => {
      expect(await browser.elementById('date').text()).toMatch(isoDateRegExp)
    })

    await browser.elementById('submit-button-random').click()
    await retry(async () => {
      expect(await browser.elementById('random').text()).toMatch(randomRegExp)
    })
  })

  it('can invoke a nested cache function passed before its declaration', async () => {
    const $ = await next.render$('/hoisted-cache')
    expect($('#missing-greet-action').text()).toBe('')

    const browser = await next.browser('/hoisted-cache')
    await browser.elementById('submit-greeting').click()
    await retry(async () => {
      expect(await browser.elementById('greeting').text()).toBe('Hello, Ada!')
    })
  })

  it('supports hoisted nested cache and server action declarations across scopes', async () => {
    const browser = await next.browser('/hoisted-nested')

    expect(await browser.elementById('no-closure').text()).toBe('1234')
    expect(await browser.elementById('mutated-cache').text()).toBe(
      'first,second'
    )

    await browser.elementById('btn-mutated-action').click()
    await retry(async () => {
      expect(await browser.elementById('res-mutated-action').text()).toBe(
        'updated'
      )
    })

    await browser.elementById('btn-bound-action').click()
    await retry(async () => {
      expect(await browser.elementById('res-bound-action').text()).toBe(
        'updated:extra'
      )
    })

    await browser.elementById('btn-loop-0').click()
    await retry(async () => {
      expect(await browser.elementById('res-loop-0').text()).toBe('item-0')
    })

    await browser.elementById('btn-loop-1').click()
    await retry(async () => {
      expect(await browser.elementById('res-loop-1').text()).toBe('item-1')
    })
  })
})
