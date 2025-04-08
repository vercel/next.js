import fs from 'fs'
import { nextTestSetup } from 'e2e-utils'
import path from 'path'

describe('graceful-degrade-error', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  // Delete client chunks to simulate chunk loading failure
  beforeAll(() => {
    const clientChunkDir = path.join(next.testDir, '.next', 'static', 'chunks')
    const clientChunkFiles = fs
      .readdirSync(clientChunkDir)
      // filter out the js file that contains the text "large test content"
      .filter((filename) => {
        const filePath = path.join(clientChunkDir, filename)
        const isJsFile = filename.endsWith('.js')
        const fileContent = isJsFile
          ? fs.readFileSync(filePath, { encoding: 'utf8' })
          : ''

        return (
          isJsFile && fileContent && fileContent.includes('large test content')
        )
      })
      .map((file) => path.join(clientChunkDir, file))

    // Intended to log to help debugging tests
    console.log('Deleting client chunk files:', clientChunkFiles)
    // delete all chunk files
    clientChunkFiles.map((file) => fs.rmSync(file))
  })

  it('should degrade to graceful error when chunk loading fails in ssr for bot', async () => {
    const browser = await next.browser('/', {
      userAgent: 'Googlebot',
    })

    const logs = await browser.log()
    const errors = logs
      .filter((x) => x.source === 'error')
      .map((x) => x.message)
      .join('\n')

    if (process.env.IS_TURBOPACK_TEST) {
      expect(errors).toMatch(/Failed to load chunk/)
    } else {
      expect(errors).toMatch(/Loading chunk \d+ failed./)
    }

    // Should show error banner
    const errorBanner = await browser.elementByCss('#next-graceful-error')
    expect(await errorBanner.text()).toBe(
      'An error occurred during page rendering'
    )

    // Should show the original content
    const originHtml = await browser.elementByCss('html')
    const originBody = await browser.elementByCss('body')
    expect(await originHtml.getAttribute('class')).toBe('layout-cls')
    expect(await originBody.getAttribute('class')).toBe('body-cls')
  })
})
