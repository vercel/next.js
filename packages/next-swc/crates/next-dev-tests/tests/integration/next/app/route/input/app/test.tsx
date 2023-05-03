'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

function test() {
  it('should make a GET request', async () => {
    const res = await fetch('/world')
    const text = await res.text()
    expect(text).toEqual('hello world')
    expect(res.headers.get('method')).toEqual('GET')
  }, 20000)

  it('should make a POST request', async () => {
    const res = await fetch('/route.js', {
      method: 'POST',
    })
    const text = await res.text()
    expect(text).toEqual('hello route.js')
    expect(res.headers.get('method')).toEqual('POST')
  }, 20000)

  it('should make a GET request to /api/crypto which should support node builtins', async () => {
    const res = await fetch('/api/crypto')
    const text = await res.text()
    expect(text).toEqual('{"data":"secret"}')
  }, 20000)
}

export default function Test() {
  useTestHarness(() => test())
}
