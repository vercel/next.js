import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('App asPath', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should not have any changes in asPath after a bundle rebuild', async () => {
    const browser = await next.browser('/')

    const text = await browser.elementByCss('body').text()
    expect(text).toBe(
      '{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }'
    )

    const originalContent = await next.readFile('pages/_app.js')
    const editedContent = originalContent.replace(
      'find this',
      'replace with this'
    )

    await next.patchFile('pages/_app.js', editedContent)

    await retry(async () => {
      const newContent = await browser.elementByCss('body').text()
      expect(newContent).toBe(
        '{ "url": { "query": {}, "pathname": "/", "asPath": "/" } }'
      )
    })
  })
})
