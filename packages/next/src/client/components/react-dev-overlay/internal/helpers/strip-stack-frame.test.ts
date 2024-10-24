import { stripStackByFrame } from './strip-stack-frame'

describe('stripStackByFrame', () => {
  it('strips stack after frame', () => {
    const stripStackByFrameBefore = (stack: string) =>
      stripStackByFrame(stack, 'special-stack-frame', true)

    const stack = `Error: test
    at page (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at special-stack-frame (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    `

    const strippedStack = stripStackByFrameBefore(stack)
    expect(strippedStack).toMatchInlineSnapshot(`
      "Error: test
          at page (http://localhost:3000/_next/static/chunks/webpack.js:1:1)"
    `)
  })

  it('strips stack before frame', () => {
    const stripStackByFrameAfter = (stack: string) =>
      stripStackByFrame(stack, 'special-stack-frame', false)

    const stack = `Error: test
    at page (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at special-stack-frame (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    `

    const strippedStack = stripStackByFrameAfter(stack)
    expect(strippedStack).toMatchInlineSnapshot(`
      "    at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
          "
    `)
  })
})
