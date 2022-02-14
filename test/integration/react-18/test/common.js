/* eslint-env jest */

import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import {
  fetchViaHTTP,
  renderViaHTTP,
  hasRedbox,
  getRedboxSource,
} from 'next-test-utils'

export default (context) => {
  it('throws if useFlushEffects is called more than once', async () => {
    await renderViaHTTP(context.appPort, '/use-flush-effect/multiple-calls')
    expect(context.stderr).toContain(
      'Error: The `useFlushEffects` hook cannot be called more than once.'
    )
  })

  it('throws if useFlushEffects is called on the client', async () => {
    const browser = await webdriver(context.appPort, '/use-flush-effect/client')
    expect(await hasRedbox(browser)).toBe(true)
    expect(await getRedboxSource(browser)).toMatch(
      /Error: useFlushEffects can not be called on the client/
    )
  })
}
