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
  })
})
