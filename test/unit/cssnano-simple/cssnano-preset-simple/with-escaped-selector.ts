import postcss from 'postcss'
import mod from './plugin'

describe('with escaped selector', () => {
  test('should not misplace the backslash', async () => {
    const input = `
      .foo\\,2 {
        background: blue;
      }
    `

    const res = await postcss([mod]).process(input, {
      from: 'input.css',
      to: 'output.css',
    })

    expect(res.css).toMatchInlineSnapshot(`".foo\\\\,2{background:blue}"`)
  })
})
