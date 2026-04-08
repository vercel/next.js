/* eslint-env jest */
import { join } from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { fetchViaHTTP } from 'next-test-utils'

describe('Raw Loader CSS Import', () => {
  let next

  beforeAll(async () => {
    const files = {
      'pages/index.js': new FileRef(join(__dirname, '../pages/index.js')),
      'pages/styles.css': new FileRef(join(__dirname, '../pages/styles.css')),
      'next.config.js': new FileRef(join(__dirname, '../next.config.js')),
    }

    next = await createNext({
      files,
      dependencies: {
        'raw-loader': '^4.0.2',
      },
    })
  })

  afterAll(async () => {
    await next.destroy()
  })

  it('should return raw CSS content instead of applying styles', async () => {
    const res = await fetchViaHTTP(next.url, '/')
    const html = await res.text()

    // The page should NOT have a red background (which would indicate CSS was applied)
    expect(html).not.toContain('background-color: red')

    // The page should contain the raw CSS content
    expect(html).toContain('/* This CSS file is imported with raw-loader */')
    expect(html).toContain('body {')
    expect(html).toContain('background-color: red !important;')
    expect(html).toContain('.test {')
    expect(html).toContain('color: red;')

    // The page should show the test instructions
    expect(html).toContain('Raw Loader Test')
    expect(html).toContain('If the CSS content above shows raw CSS')
  })
})
