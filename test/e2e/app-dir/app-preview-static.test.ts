import { NextInstance } from 'test/lib/next-modes/base'
import { createNext, FileRef } from 'e2e-utils'
import path from 'path'
import webdriver from 'next-webdriver'

describe('app-dir previewData with SSG', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  let next: NextInstance

  afterAll(() => next.destroy())
  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, 'app-preview-static')),
    })
  })

  it('Should not throw Dynamic Server Usage error when using generateStaticParams with previewData', async () => {
    const browserOnIndexPage = await webdriver(next.url, '/')

    const content = await browserOnIndexPage
      .elementByCss('#preview-data')
      .text()

    expect(content).toContain('previewData')
  })
})
