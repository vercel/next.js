/* eslint-env jest */

import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('bundlePagesRouterDependencies', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, '..'),
  })

  it('should render the page', async () => {
    const html = await next.render('/')
    expect(html).toInclude('bar and baz')
  })

  it('should bundle pages dependencies except for serverExternalPackages', async () => {
    const html = await next.render('/')
    expect(html).toMatch(
      /require\(&[\w#]+;.\/opted-out-external-package-source&[\w#]+;\)/
    )
    expect(html).not.toMatch(
      /require\(&[\w#]+;.\/external-package-source&[\w#]+;\)/
    )
    if (process.env.TURBOPACK) {
      expect(html).toInclude(
        'node_modules/external-package/external-package-source.js [ssr] (ecmascript)'
      )
    } else {
      expect(html).toInclude(
        '/*! ./external-package-source */ &quot;./node_modules/external-package/external-package-source.js&quot;'
      )
    }
  })
})
