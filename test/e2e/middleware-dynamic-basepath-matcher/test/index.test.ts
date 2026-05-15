/* eslint-env jest */
/* eslint-disable jest/no-standalone-expect */

import { join } from 'path'
import webdriver from 'next-webdriver'
import { check, fetchViaHTTP } from 'next-test-utils'
import { FileRef, nextTestSetup } from 'e2e-utils'

const itif = (condition: boolean) => (condition ? it : it.skip)

const isModeDeploy = process.env.NEXT_TEST_MODE === 'deploy'

describe('Middleware custom matchers basePath', () => {
  const { next } = nextTestSetup({
    files: new FileRef(join(__dirname, '../app')),
  })

  // FIXME
  // See https://linear.app/vercel/issue/EC-170/middleware-rewrite-of-nextjs-with-basepath-does-not-work-on-vercel
  itif(!isModeDeploy)('should match', async () => {
    for (const path of [
      '/base/default',
      `/base/_next/data/${next.buildId}/default.json`,
    ]) {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(200)
      expect(res.headers.get('x-from-middleware')).toBeDefined()
    }
  })

  it.each(['/default', '/invalid/base/default'])(
    'should not match',
    async (path) => {
      const res = await fetchViaHTTP(next.url, path)
      expect(res.status).toBe(404)
    }
  )

  // FIXME:
  // See https://linear.app/vercel/issue/EC-160/header-value-set-on-middleware-is-not-propagated-on-client-request-of
  itif(!isModeDeploy)('should match query path', async () => {
    const browser = await webdriver(next.url, '/base/random')
    await check(() => browser.elementById('router-path').text(), 'random')
    await browser.elementById('linkelement').click()
    await check(() => browser.elementById('router-path').text(), 'another-page')
  })
})
