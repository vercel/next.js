'use client'

import { useEffect } from 'react'

function test() {
  it('should handle cookies in Route request', async () => {
    const res = await fetch('/api/test')
    const text = await res.text()
    expect(text).toEqual('hello world')
    expect(res.headers.get('method')).toEqual('GET')
  }, 20000)
}

export default function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => test())
    return () => {}
  }, [])
}
