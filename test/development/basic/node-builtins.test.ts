import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('node builtins', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'node-builtins'),
  })

  it('should have polyfilled node.js builtins for the browser correctly', async () => {
    const browser = await next.browser('/')

    await browser.waitForCondition('window.didRender', 15000)

    const data = await browser
      .waitForElementByCss('#node-browser-polyfills')
      .text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.process).toBe('browser')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })

  it('should have polyfilled node.js builtins for the browser correctly in client component', async () => {
    const browser = await next.browser('/client-component')

    await browser.waitForCondition('window.didRender', 15000)

    const data = await browser
      .waitForElementByCss('#node-browser-polyfills')
      .text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.process).toBe('browser')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })

  it('should support node.js builtins', async () => {
    const $ = await next.render$('/server')

    const data = $('#node-browser-polyfills').text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.process).toInclude('next-server')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })

  it('should support node.js builtins prefixed by node:', async () => {
    const $ = await next.render$('/server-node-schema')

    const data = $('#node-browser-polyfills').text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.process).toInclude('next-server')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })

  it('should support node.js builtins in server component', async () => {
    const $ = await next.render$('/server-component')

    const data = $('#node-browser-polyfills').text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })

  it('should support node.js builtins prefixed by node: in server component', async () => {
    const $ = await next.render$('/server-component/node-schema')

    const data = $('#node-browser-polyfills').text()
    const parsedData = JSON.parse(data)

    expect(parsedData.vm).toBe(105)
    expect(parsedData.hash).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9'
    )
    expect(parsedData.buffer).toBe('hello world')
    expect(parsedData.stream).toBe(true)
    expect(parsedData.assert).toBe(true)
    expect(parsedData.constants).toBe(7)
    expect(parsedData.domain).toBe(true)
    expect(parsedData.http).toBe(true)
    expect(parsedData.https).toBe(true)
    expect(parsedData.os).toBe('\n')
    expect(parsedData.path).toBe('/hello/world/test.txt')
    expect(parsedData.querystring).toBe('a=b')
    expect(parsedData.stringDecoder).toBe(true)
    expect(parsedData.sys).toBe(true)
    expect(parsedData.timers).toBe(true)
  })

  it('should throw when unsupported builtins are used in middleware', async () => {
    const res = await next.fetch('/middleware-test')
    expect(res.status).toBe(200)
    expect(JSON.parse(res.headers.get('supported-result')))
      .toMatchInlineSnapshot(`
      {
        "assert": true,
        "buffer": "hello world",
        "eventEmitter": true,
        "util": true,
      }
    `)
    expect(JSON.parse(res.headers.get('unsupported-result')))
      .toMatchInlineSnapshot(`
      {
        "constants": false,
        "crypto": false,
        "domain": false,
        "http": false,
        "https": false,
        "os": false,
        "path": false,
        "stream": false,
        "timers": false,
        "tty": false,
        "vm": false,
        "zlib": false,
      }
    `)
  })
})
