import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { describeif } from 'next-test-utils'
import { browserName } from 'next-webdriver'
import config, { createDomainScopedWebdriver } from './baseConfig'

describeif(browserName === 'chrome')(
  'i18n-domain-link-generation with trailing slash',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'app/pages')),
        },
        dependencies: {},
        nextConfig: {
          trailingSlash: true,
          ...config,
        },
      })
    })
    afterAll(() => next.destroy())

    it('should render with trailing slash', async () => {
      const browser = await createDomainScopedWebdriver(next.appPort)
      for (const [id, expected] of [
        ['#to-home', 'http://example.com/'],
        ['#to-home-de', 'http://de.example.com/'],
      ]) {
        expect(await browser.elementByCss(id).getAttribute('href')).toEqual(
          expected
        )
      }
    })
  }
)
