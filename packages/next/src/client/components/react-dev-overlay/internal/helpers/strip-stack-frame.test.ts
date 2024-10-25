import { stripReactStackTrace } from './strip-stack-frame'

describe('stripReactStackTrace', () => {
  it('strips stack after frame', () => {
    const stack = `Error: test
    at page (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at react-stack-bottom-frame (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    `

    const strippedStack = stripReactStackTrace(stack)
    expect(strippedStack).toMatchInlineSnapshot(`
      "    at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
          "
    `)
  })

  it('strips nothing if there is no react stack', () => {
    const stack = `Error: test
    at page (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
    `

    const strippedStack = stripReactStackTrace(stack)
    expect(strippedStack).toMatchInlineSnapshot(`
      "Error: test
          at page (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
          at foo (http://localhost:3000/_next/static/chunks/webpack.js:1:1)
          "
    `)
  })
})
