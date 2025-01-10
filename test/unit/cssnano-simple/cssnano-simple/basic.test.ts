import postcss from 'postcss'

import mod from 'next/dist/compiled/cssnano-simple/index'
import css from '../noop-template'

describe('basic test', () => {
  test('should minify css', async () => {
    const input = css`
      p {
        color: yellow;
      }
    `

    const res = await postcss([mod()]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toBe('p{color:#ff0}')
  })

  test('should be able to declare layer names', async () => {
    // @layer b is equivlaent to @layer b {}
    const input = css`
      @layer b {
        ._5-enzrfpb:lang(ar) {
          font-family: myriad-arabic;
        }
      }

      @layer b;
    `

    const res = await postcss([mod()]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toBe(
      '@layer b{._5-enzrfpb:lang(ar){font-family:myriad-arabic}}@layer b;'
    )
  })
})
