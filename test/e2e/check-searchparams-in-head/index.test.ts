import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('Check searchParams in head', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        app: new FileRef(join(__dirname, './app')),
        'next.config.js': new FileRef(join(__dirname, './next.config.js')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.appPort, '/', { countryCode: 'lu' })
    expect(html).toContain('<title>Moien</title>')
  })
})
