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
    console.log(html)
    expect(html).toInclude(
      'require(&quot;./opted-out-external-package-source&quot;)'
    )
    expect(html).toInclude('./external-package-source')
    expect(html).not.toInclude('require(&quot;./external-package-source&quot;)')
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
