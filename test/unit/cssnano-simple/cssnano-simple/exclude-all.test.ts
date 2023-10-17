import postcss from 'postcss'

import mod from 'next/src/bundles/cssnano-simple/index'
import css from '../noop-template'

describe('exclude all test', () => {
  test('should not transform css', async () => {
    const input = css`
      p {
        /* test */
        color: yellow;
      }
    `

    const res = await postcss([mod({ excludeAll: true })]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toBe(input)
  })

  test('should strip comments and spaces from css', async () => {
    const input = css`
      p {
        /* test */
        color: yellow;
      }
      .empty {
      }
    `

    const res = await postcss([
      mod({
        excludeAll: true,
        discardComments: true,
        normalizeWhitespace: { exclude: false },
      }),
    ]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toMatchInlineSnapshot(`"p{color:yellow}.empty{}"`)
  })

  test('should enable rule with empty object', async () => {
    const input = css`
      p {
        /* test */
        color: yellow;
      }
      .empty {
      }
    `

    const res = await postcss([
      mod({
        excludeAll: true,
        discardComments: true,
        normalizeWhitespace: { exclude: false },
        discardEmpty: {},
      }),
    ]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toMatchInlineSnapshot(`"p{color:yellow}"`)
  })
})
