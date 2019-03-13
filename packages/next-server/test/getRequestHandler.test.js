/* eslint-env jest */

const { join } = require('path')
const createFetch = require('./fetch')
const createServer = require('../')

const dir = join(__dirname, 'app')

describe('Server#getRequestHandler', () => {
  const server = createServer({ dir })
  const fetch = createFetch(server)

  it('should return 404 for non-existing _next resources', async () => {
    const response = await fetch('/_next/non-existent')
    expect(response.status).toBe(404)
  })

  it('sets immutable header for bundled pages', async () => {
    const response = await fetch('/_next/static/test/pages/_app.js')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('sets immutable header for bundled pages', async () => {
    const response = await fetch('/_next/static/test/pages/_app.js')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('sets immutable header for runtime resources', async () => {
    const response = await fetch('/_next/static/runtime/webpack.test1234.js')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('sets immutable header for chunks', async () => {
    const response = await fetch('/_next/static/chunks/example.abcd1234.css')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
  })

  it('leaves default cache-control for other resources', async () => {
    const response = await fetch('/_next/static/css/test.css')
    expect(response.headers.get('cache-control')).toBe('public, max-age=0')
  })

  it('serves static files', async () => {
    const response = await fetch('/static/robots.txt')
    expect(await response.text()).toBe('Hello, robots!\n')
  })
})
