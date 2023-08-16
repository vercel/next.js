'use client'

import { useTestHarness } from '@turbo/pack-test-harness'

function test() {
  it('should handle cookies in Route request', async () => {
    const first = await fetch('/api/test')
    const text = await first.text()
    expect(text).toMatch(/[\d.]+/)

    const second = await fetch('/api/test')
    expect(await second.text()).toEqual(text)
  }, 20000)
}

export default function Test() {
  useTestHarness(test)
}
