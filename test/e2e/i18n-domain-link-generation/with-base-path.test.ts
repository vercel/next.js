import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { describeif } from 'next-test-utils'
import { browserName } from 'next-webdriver'
import config, { createDomainScopedWebdriver } from './baseConfig'

describeif(browserName === 'chrome')(
  'i18n-domain-link-generation with base path',
  () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          pages: new FileRef(join(__dirname, 'app/pages')),
        },
        dependencies: {},
        nextConfig: {
          basePath: '/base-path',
          ...config,
        },
      })
    })
    afterAll(() => next.destroy())

    it('should render with base path', async () => {
      const browser = await createDomainScopedWebdriver(
        next.appPort,
        '/base-path'
      )
      for (const [id, expected] of [
        ['#to-home', 'http://example.com/base-path'],
        ['#to-home-de', 'http://de.example.com/base-path'],
      ]) {
        expect(await browser.elementByCss(id).getAttribute('href')).toEqual(
          expected
        )
      }
    })
  }
)
