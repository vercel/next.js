import { nextTestSetup } from 'e2e-utils'

describe('Polyfills', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      unfetch: '4.2.0',
      'isomorphic-unfetch': '3.0.0',
      'whatwg-fetch': '3.0.0',
    },
  })

  it('should alias fetch', async () => {
    const browser = await next.browser('/fetch')
    const text = await browser.elementByCss('#test-status').text()
    expect(text).toBe('pass')
  })

  it('should allow using process.env when there is an element with `id` of `process`', async () => {
    const browser = await next.browser('/process')
    const text = await browser.elementByCss('#process').text()
    expect(text).toBe('Hello, stranger')
  })

  it('should contain generated page count in output', async () => {
    const output = next.cliOutput
    expect(output).toMatch(/Generating static pages.*\(0\/5\)/g)
    expect(output).toMatch(/Generating static pages.*\(5\/5\)/g)
    expect(output.match(/Generating static pages/g).length).toBe(5)
  })
})
