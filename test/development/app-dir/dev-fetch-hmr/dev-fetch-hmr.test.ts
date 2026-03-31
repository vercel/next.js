import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

import cheerio from 'cheerio'

describe('dev-fetch-hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should retain module level fetch patching', async () => {
    const html = await next.render('/')
    expect(html).toContain('monkey patching is fun')

    const magicNumber = cheerio.load(html)('#magic-number').text()

    const html2 = await next.render('/')
    expect(html2).toContain('monkey patching is fun')
    const magicNumber2 = cheerio.load(html2)('#magic-number').text()
    // Module was not re-evaluated
    expect(magicNumber2).toBe(magicNumber)
    const update = cheerio.load(html2)('#update').text()
    expect(update).toBe('touch to trigger HMR')

    await next.patchFile('app/page.tsx', (content) =>
      content.replace('touch to trigger HMR', 'touch to trigger HMR 2')
    )
    // For server hmr, we must touch the exact module to trigger re-evaluation
    await next.patchFile('app/layout.tsx', (content) =>
      content.replace(
        'const magicNumber = Math.random()',
        '// hmr trigger\nconst magicNumber = Math.random()'
      )
    )

    await retry(async () => {
      const html3 = await next.render('/')
      const update2 = cheerio.load(html3)('#update').text()
      expect(update2).toBe('touch to trigger HMR 2')
      const magicNumber3 = cheerio.load(html3)('#magic-number').text()
      expect(html3).toContain('monkey patching is fun')
      // Module was re-evaluated
      expect(magicNumber3).not.toEqual(magicNumber)
    })
  })
})
