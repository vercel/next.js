import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, getRedboxSource } from 'next-test-utils'
import webdriver from 'next-webdriver'
import { join } from 'path'

describe('font-loader-in-document-error', () => {
  const isDev = (global as any).isNextDev
  let next: NextInstance

  if (!isDev) {
    it('should only run on next dev', () => {})
    return
  }

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'font-loader-in-document/pages')),
        'next.config.js': new FileRef(
          join(__dirname, 'font-loader-in-document/next.config.js')
        ),
      },
      dependencies: {
        '@next/font': 'canary',
      },
    })
  })
  afterAll(() => next.destroy())

  test('font loader inside _document', async () => {
    const browser = await webdriver(next.appPort, '/')
    await check(() => getRedboxSource(browser), /Font loaders/)
    expect(await getRedboxSource(browser)).toInclude(
      'Font loaders cannot be used within pages/_document.js'
    )
  })
})
