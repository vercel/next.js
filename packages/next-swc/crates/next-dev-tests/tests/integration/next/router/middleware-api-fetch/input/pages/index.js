import { useEffect } from 'react'

export default function Foo() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return 'index'
}

function runTests() {
  it('router has correct host when not specified', async () => {
    // Without a host query param, the router will use the request's origin
    // to fetch from the API endpoint.
    const res = await fetch('/fetch-endpoint')
    const env = await res.json()
    expect(env).toHaveProperty('name', 'John Doe')
  })

  it('router can fetch localhost', async () => {
    const res = await fetch(`/fetch-endpoint?host=localhost:${location.port}`)
    const env = await res.json()
    expect(env).toHaveProperty('name', 'John Doe')
  })

  it('router can fetch 127.0.0.1', async () => {
    const res = await fetch(`/fetch-endpoint?host=127.0.0.1:${location.port}`)
    const env = await res.json()
    expect(env).toHaveProperty('name', 'John Doe')
  })

  it('router can fetch 0.0.0.0', async () => {
    const res = await fetch(`/fetch-endpoint?host=0.0.0.0:${location.port}`)
    const env = await res.json()
    expect(env).toHaveProperty('name', 'John Doe')
  })

  it('router can fetch IPv6', async () => {
    const res = await fetch(`/fetch-endpoint?host=[::1]:${location.port}`)
    const env = await res.json()
    expect(env).toHaveProperty('name', 'John Doe')
  })
}
