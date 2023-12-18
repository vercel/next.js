import { nextTestSetup } from 'e2e-utils'
import { describeVariants } from 'next-test-utils'
import { join } from 'path'
import { readdir, readFile } from 'node:fs/promises'

describeVariants.each(['turbo'])('experimental-lightningcss', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support css modules', async () => {
    // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
    // swc_css does not include `-module` in the class name, while lightningcss does.
    expect($('p').attr('class')).toBe(
      'search-keyword style-module__hlQ3RG__blue'
    )
  })
})

// lightningcss produces different class names in turbo mode
describeVariants.each(['default'])(
  'experimental-lightningcss with default mode',
  () => {
    describe('in dev server', () => {
      const { next } = nextTestSetup({
        files: __dirname,
        dependencies: { lightningcss: '^1' },
      })

      it('should support css modules', async () => {
        // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
        const $ = await next.render$('/')
        expect($('p').text()).toBe('hello world')
        // We remove hash frmo the class name in test mode using env var because it is not deterministic.
        expect($('p').attr('class')).toBe('search-keyword style-module__blue')
      })
    })
  }
)
