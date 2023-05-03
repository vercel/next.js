'use client'

import { useEffect } from 'react'

function test() {
  it('should handle cookies in Route request', async () => {
    const first = await fetch('/api/test')
    const text = await first.text()
    expect(text).toMatch(/[\d.]+/)

    const second = await fetch('/api/test')
    expect(await second.text()).toEqual(text);
  }, 20000)
}

export default function Test() {
  useEffect(() => {
    import('@turbo/pack-test-harness').then(() => test())
    return () => {}
  }, [])
}
