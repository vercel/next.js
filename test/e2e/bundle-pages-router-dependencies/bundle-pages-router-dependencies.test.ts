/* eslint-env jest */

import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('bundlePagesRouterDependencies', () => {
  const { next } = nextTestSetup({
    files: join(__dirname),
  })

  it('should bundle pages dependencies except for serverExternalPackages', async () => {
    const $ = await next.render$('/')

    let bundledDirname = $('#bundled').text()
    expect(bundledDirname).not.toStartWith(next.testDir)
    expect(bundledDirname).toInclude('bundled-package')

    let externalDirname = $('#external').text()
    expect(externalDirname).toStartWith(next.testDir)
    expect(externalDirname).toInclude('external-package')
  })
})
