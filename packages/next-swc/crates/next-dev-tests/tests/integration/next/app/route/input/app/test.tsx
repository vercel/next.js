'use client'

import { useEffect } from 'react'

function test() {
  it('should make a GET request', async () => {
    const res = await fetch('/world')
    const text = await res.text()
    expect(text).toEqual('hello world')
    expect(res.headers.get('method')).toEqual('GET')
  }, 20000)

  it('should make a GET request to /cryto which should support node builtins', async () => {
    const res = await fetch('/crypto')
    const text = await res.text()
    expect(text).toEqual('{ "data": "crypto" }')
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
}

export default function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => test())
    return () => {}
  }, [])
}
