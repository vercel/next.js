import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

describe('CSS Modules Production', () => {
  describe('Basic CSS Module Support', () => {
    const { next, isTurbopack, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/basic-module'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet.attr('href')

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())

      if (isTurbopack) {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`".index-module__KWKY6G__redText{color:red}"`)
      } else {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`".index_redText__honUV{color:red}"`)
      }
    })

    it(`should've injected the CSS on server render`, async () => {
      const $ = await next.render$('/')

      const cssPreload = $('link[rel="preload"][as="style"]')
      expect(cssPreload.length).toBe(1)
      expect(cssPreload.attr('href')).toMatch(
        /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
      )

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      expect(cssSheet.attr('href')).toMatch(
        /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
      )

      if (isTurbopack) {
        expect($('#verify-red').attr('class')).toMatchInlineSnapshot(
          `"index-module__KWKY6G__redText"`
        )
      } else {
        expect($('#verify-red').attr('class')).toMatchInlineSnapshot(
          `"index_redText__honUV"`
        )
      }
    })
  })

  describe('3rd Party CSS Module Support', () => {
    const { next, isTurbopack, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/3rd-party-module'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet.attr('href')

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())
      if (isTurbopack) {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".index-module__KWKY6G__foo{position:relative}:is(.index-module__KWKY6G__foo .bar,.index-module__KWKY6G__foo .baz){height:100%;overflow:hidden}.index-module__KWKY6G__foo .lol{width:80%}.index-module__KWKY6G__foo>.lel{width:80%}"`
        )
      } else {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".index_foo__6TgnK{position:relative}.index_foo__6TgnK .bar,.index_foo__6TgnK .baz{height:100%;overflow:hidden}.index_foo__6TgnK .lol,.index_foo__6TgnK>.lel{width:80%}"`
        )
      }
    })

    it(`should've injected the CSS on server render`, async () => {
      const $ = await next.render$('/')

      const cssPreload = $('link[rel="preload"][as="style"]')
      expect(cssPreload.length).toBe(1)
      expect(cssPreload.attr('href')).toMatch(
        /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
      )

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      expect(cssSheet.attr('href')).toMatch(
        /^\/_next\/static\/.*\.css(\?dpl=.*)?$/
      )

      if (isTurbopack) {
        expect($('#verify-div').attr('class')).toMatchInlineSnapshot(
          `"index-module__KWKY6G__foo"`
        )
      } else {
        expect($('#verify-div').attr('class')).toMatchInlineSnapshot(
          `"index_foo__6TgnK"`
        )
      }
    })
  })

  describe('Has CSS Module in computed styles in Production', () => {
    const { next, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/prod-module'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it('should have CSS for page', async () => {
      const browser = await next.browser('/')

      const currentColor = await browser.eval(
        `window.getComputedStyle(document.querySelector('#verify-red')).color`
      )
      expect(currentColor).toMatchInlineSnapshot(`"rgb(255, 0, 0)"`)
    })
  })

  describe.skip('Invalid CSS Module Usage in node_modules', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures/invalid-module'),
      skipStart: true,
    })

    it('should fail to build', async () => {
      await next.build()
      expect(next.cliOutput).toContain('Failed to compile')
      expect(next.cliOutput).toContain('node_modules/example/index.module.css')
      expect(next.cliOutput).toMatch(
        /CSS Modules.*cannot.*be imported from within.*node_modules/
      )
    })
  })

  describe.skip('Invalid Global CSS Module Usage in node_modules', () => {
    const { next } = nextTestSetup({
      files: join(__dirname, 'fixtures/invalid-global-module'),
      skipStart: true,
    })

    it('should fail to build', async () => {
      await next.build()
      expect(next.cliOutput).toContain('Failed to compile')
      expect(next.cliOutput).toContain('node_modules/example/index.css')
      expect(next.cliOutput).toMatch(
        /Global CSS.*cannot.*be imported from within.*node_modules/
      )
    })
  })

  describe('Valid CSS Module Usage from within node_modules', () => {
    const { next, isTurbopack, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/nm-module'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it(`should've prerendered with relevant data`, async () => {
      const $ = await next.render$('/')

      const cssPreload = $('#nm-div')
      if (isTurbopack) {
        expect(cssPreload.text()).toMatchInlineSnapshot(
          `"{"message":"Why hello there","default":{"message":"Why hello there"}} {"redText":"index-module__PIKFPa__redText","default":{"redText":"index-module__PIKFPa__redText"}}"`
        )
      } else {
        expect(cssPreload.text()).toMatchInlineSnapshot(
          `"{"message":"Why hello there"} {"redText":"example_redText__0ctGB"}"`
        )
      }
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet.attr('href')

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())

      if (isTurbopack) {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`".index-module__PIKFPa__redText{color:red}"`)
      } else {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`".example_redText__0ctGB{color:red}"`)
      }
    })
  })

  // Disabled with Turbopack because `composes` from `.css` files in `.module.css` files is not supported.
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'Valid Nested CSS Module Usage from within node_modules',
    () => {
      const { next, isTurbopack, isNextStart } = nextTestSetup({
        files: join(__dirname, 'fixtures/nm-module-nested'),
      })

      if (!isNextStart) {
        it('skipped for non-start mode', () => {})
        return
      }

      it(`should've prerendered with relevant data`, async () => {
        const $ = await next.render$('/')

        const cssPreload = $('#nm-div')
        expect(cssPreload.text()).toMatchInlineSnapshot(
          `"{"message":"Why hello there"} {"subClass":"example_subClass__m6Tyy other_className__OA8dV"}"`
        )
      })

      it(`should've emitted a single CSS file`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)
        const stylesheet = cssSheet.attr('href')

        const cssContent = await next
          .fetch(stylesheet)
          .then((res) => res.text())

        if (isTurbopack) {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(
            `".other2_other2__dYPgz{color:red}.other3_other3__7hgUE{color:violet}.other_className__OA8dV{background:red;color:#ff0}.example_subClass__m6Tyy{background:blue}"`
          )
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(
            `".other2_other2__dYPgz{color:red}.other3_other3__7hgUE{color:violet}.other_className__OA8dV{background:red;color:yellow}.example_subClass__m6Tyy{background:blue}"`
          )
        }
      })
    }
  )

  describe('CSS Module Composes Usage (Basic)', () => {
    const { next, isTurbopack, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/composes-basic'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet.attr('href')

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())

      if (isTurbopack) {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".index-module__KWKY6G__className{color:#ff0;background:red}.index-module__KWKY6G__subClass{background:#00f;}"`
        )
      } else {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".index_className__jjcZ1{background:red;color:yellow}.index_subClass__eDzaW{background:blue}"`
        )
      }
    })
  })

  // Disabled with Turbopack because `composes` from `.css` files in `.module.css` files is not supported.
  ;(process.env.IS_TURBOPACK_TEST ? describe.skip : describe)(
    'CSS Module Composes Usage (External)',
    () => {
      const { next, isTurbopack, isNextStart } = nextTestSetup({
        files: join(__dirname, 'fixtures/composes-external'),
      })

      if (!isNextStart) {
        // eslint-disable-next-line jest/no-identical-title
        it('skipped for non-start mode', () => {})
        return
      }

      // eslint-disable-next-line jest/no-identical-title
      it(`should've emitted a single CSS file`, async () => {
        const $ = await next.render$('/')

        const cssSheet = $('link[rel="stylesheet"]')
        expect(cssSheet.length).toBe(1)
        const stylesheet = cssSheet.attr('href')

        const cssContent = await next
          .fetch(stylesheet)
          .then((res) => res.text())

        if (isTurbopack) {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(
            `".other_className__eZV4M{background:red;color:#ff0}.index_subClass__eDzaW{background:blue}"`
          )
        } else {
          expect(
            cssContent.replace(/\/\*.*?\*\//g, '').trim()
          ).toMatchInlineSnapshot(
            `".other_className__eZV4M{background:red;color:yellow}.index_subClass__eDzaW{background:blue}"`
          )
        }
      })
    }
  )

  describe('Dynamic Route CSS Module Usage', () => {
    const { next, isTurbopack, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/dynamic-route-module'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it('should apply styles correctly', async () => {
      const browser = await next.browser('/post-1')

      const background = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')

      expect(background).toMatch(/rgb(a|)\(255, 0, 0/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/post-1')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet.attr('href')

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())
      if (isTurbopack) {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`".index-module__9fTRMq__home{background:red}"`)
      } else {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(`"._post__home__yRmHz{background:#f00}"`)
      }
    })
  })

  describe('Catch-all Route CSS Module Usage', () => {
    const { next, isTurbopack, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/catch-all-module'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it('should apply styles correctly', async () => {
      const browser = await next.browser('/post-1')

      const bg = await browser
        .elementByCss('#my-div')
        .getComputedCss('background-color')
      expect(bg).toMatch(/rgb(a|)\(255, 0, 0/)

      const fg = await browser.elementByCss('#my-div').getComputedCss('color')
      expect(fg).toMatch(/rgb(a|)\(0, 128, 0/)
    })

    it(`should've emitted a single CSS file`, async () => {
      const $ = await next.render$('/post-1')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet.attr('href')

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())

      if (isTurbopack) {
        expect(cssContent.replace(/\/\*.*?\*\/\n?/g, '').trim())
          .toMatchInlineSnapshot(`
         ".index-module__vy7_gG__home{background:red}
         .\\35 5css-module__c9Qeqa__home{color:green}"
        `)
      } else {
        expect(
          cssContent.replace(/\/\*.*?\*\//g, '').trim()
        ).toMatchInlineSnapshot(
          `".___post__home__e4zfx{background:#f00}.__55css_home__r8Rnq{color:green}"`
        )
      }
    })
  })

  describe('cssmodules-pure-no-check usage', () => {
    const { next, isNextStart } = nextTestSetup({
      files: join(__dirname, 'fixtures/cssmodules-pure-no-check'),
    })

    if (!isNextStart) {
      it('skipped for non-start mode', () => {})
      return
    }

    it('should have compiled successfully', () => {
      expect(next.cliOutput).toMatch(/Compiled successfully/)
    })

    it('should apply styles correctly', async () => {
      const browser = await next.browser('/')

      const elementWithGlobalStyles = await browser
        .elementByCss('#my-div')
        .getComputedCss('font-weight')

      expect(elementWithGlobalStyles).toBe('700')
    })

    it(`should've emitted a CSS file`, async () => {
      const $ = await next.render$('/')

      const cssSheet = $('link[rel="stylesheet"]')
      expect(cssSheet.length).toBe(1)
      const stylesheet = cssSheet[0].attribs['href']

      const cssContent = await next.fetch(stylesheet).then((res) => res.text())

      const cssCode = cssContent.replace(/\/\*.*?\*\//g, '').trim()

      expect(cssCode).toInclude(`.global{font-weight:700}`)
      expect(cssCode).toInclude(
        `::view-transition-old(root){animation-duration:.3s}`
      )
    })
  })
})
