import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// Not supported when using webpack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'postcss-config-ts',
  () => {
    describe('postcss.config.ts', () => {
      const { next } = nextTestSetup({
        files: new FileRef(join(__dirname, 'postcss-config')),
      })

      it('works with postcss.config.ts files', async () => {
        const browser = await next.browser('/')
        try {
          const text = await browser.elementByCss('#test').text()
          expect(text).toBe('Hello World')
          // The CSS has `color: red` but the PostCSS plugin transforms it to green.
          // If this is green, it proves the TypeScript PostCSS config was loaded and applied.
          const color = await browser
            .elementByCss('#test')
            .getComputedCss('color')
          expect(color).toBe('rgb(0, 128, 0)')
        } finally {
          await browser.close()
        }
      })
    })

    describe('.postcssrc.ts', () => {
      const { next } = nextTestSetup({
        files: new FileRef(join(__dirname, 'postcssrc')),
      })

      it('works with .postcssrc.ts files', async () => {
        const browser = await next.browser('/')
        try {
          const text = await browser.elementByCss('#test').text()
          expect(text).toBe('Hello World')
          // The CSS has `color: red` but the PostCSS plugin transforms it to green.
          // If this is green, it proves the TypeScript PostCSS config was loaded and applied.
          const color = await browser
            .elementByCss('#test')
            .getComputedCss('color')
          expect(color).toBe('rgb(0, 128, 0)')
        } finally {
          await browser.close()
        }
      })
    })

    describe('postcss.config.mts', () => {
      const { next } = nextTestSetup({
        files: new FileRef(join(__dirname, 'postcss-config-mts')),
      })

      it('works with postcss.config.mts files', async () => {
        const browser = await next.browser('/')
        try {
          const text = await browser.elementByCss('#test').text()
          expect(text).toBe('Hello World')
          // The CSS has `color: red` but the PostCSS plugin transforms it to green.
          // If this is green, it proves the TypeScript PostCSS config was loaded and applied.
          const color = await browser
            .elementByCss('#test')
            .getComputedCss('color')
          expect(color).toBe('rgb(0, 128, 0)')
        } finally {
          await browser.close()
        }
      })
    })

    describe('postcss.config.cts', () => {
      const { next } = nextTestSetup({
        files: new FileRef(join(__dirname, 'postcss-config-cts')),
      })

      it('works with postcss.config.cts files', async () => {
        const browser = await next.browser('/')
        try {
          const text = await browser.elementByCss('#test').text()
          expect(text).toBe('Hello World')
          // The CSS has `color: red` but the PostCSS plugin transforms it to green.
          // If this is green, it proves the TypeScript PostCSS config was loaded and applied.
          const color = await browser
            .elementByCss('#test')
            .getComputedCss('color')
          expect(color).toBe('rgb(0, 128, 0)')
        } finally {
          await browser.close()
        }
      })
    })
  }
)
