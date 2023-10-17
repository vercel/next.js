import postcss from 'postcss'

import mod from 'next/src/bundles/cssnano-simple/index'
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
})
