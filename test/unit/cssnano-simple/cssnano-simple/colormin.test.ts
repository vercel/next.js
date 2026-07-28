import postcss from 'postcss'

import mod from 'next/dist/compiled/cssnano-simple/index'
import css from '../noop-template'

async function minify(input: string) {
  const res = await postcss([mod()]).process(input, {
    from: 'input.css',
    to: 'output.css',
  })
  return res.css
}

describe('colormin', () => {
  describe('lossless round-trip (regression: cssnano/cssnano#1515)', () => {
    // Before postcss-colormin@7.0.7, these inputs were converted to hsla with
    // integer-rounded saturation/lightness, producing a different rgb when the
    // browser rendered them. cssnano now keeps decimal precision in hsl output.
    test('rgb with fractional alpha stays lossless', async () => {
      expect(await minify(`.a{color:rgb(143 101 98 / 43%)}`)).toBe(
        '.a{color:rgba(143,101,98,.43)}'
      )
    })

    test('rgba(221,221,221,.5) converts to lossless hsla with decimals', async () => {
      expect(await minify(`.a{color:rgba(221,221,221,.5)}`)).toBe(
        '.a{color:hsla(0,0%,86.7%,.5)}'
      )
    })
  })

  describe('keyword minification', () => {
    test('rgb(255,0,0) shortens to red', async () => {
      expect(await minify(`.a{color:rgb(255,0,0)}`)).toBe('.a{color:red}')
    })

    test('hsl(0,100%,50%) shortens to red', async () => {
      expect(await minify(`.a{color:hsl(0,100%,50%)}`)).toBe('.a{color:red}')
    })

    test('rgba(0,0,0,0) shortens to transparent', async () => {
      expect(await minify(`.a{color:rgba(0,0,0,0)}`)).toBe(
        '.a{color:transparent}'
      )
    })
  })

  describe('hex shortening', () => {
    test('6-digit hex shortens to 3-digit when possible', async () => {
      expect(await minify(`.a{color:#ffaaff}`)).toBe('.a{color:#faf}')
    })

    test('rgb(255,255,255) shortens to #fff', async () => {
      expect(await minify(`.a{color:rgb(255,255,255)}`)).toBe('.a{color:#fff}')
    })

    test('white keyword shortens to #fff', async () => {
      expect(await minify(`.a{color:white}`)).toBe('.a{color:#fff}')
    })

    test('fully opaque rgba drops alpha and shortens', async () => {
      expect(await minify(`.a{color:rgba(17,34,51,1)}`)).toBe('.a{color:#123}')
    })
  })

  describe('colormin can be disabled', () => {
    test('opts.colormin = false leaves colors untouched', async () => {
      const input = css`
        .a {
          color: rgb(255, 0, 0);
        }
      `
      const res = await postcss([mod({ colormin: false })]).process(input, {
        from: 'input.css',
        to: 'output.css',
      })
      expect(res.css).toBe('.a{color:rgb(255,0,0)}')
    })
  })
})
