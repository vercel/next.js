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
    expect(magicNumber).toBe(magicNumber2)

    // trigger HMR
    await next.patchFile('app/page.tsx', (content) =>
      content.replace('touch to trigger HMR', 'touch to trigger HMR 2')
    )

    await retry(async () => {
      const html3 = await next.render('/')
      const magicNumber3 = cheerio.load(html3)('#magic-number').text()
      expect(html3).toContain('monkey patching is fun')
      expect(magicNumber).not.toEqual(magicNumber3)
    })
  })
})
