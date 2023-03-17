import { useEffect } from 'react'

export default function Foo() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return 'index'
}

function runTests() {
  it('should set header onto response', async () => {
    let start = Date.now()
    const res = await fetch('/stream')
    const reader = res.body.getReader()

    // we're only testing the timing
    const { value, done } = await reader.read()

    // The body still stream for 1 second, we just want the first chunk
    // to be delivered within 500ms.
    expect(Date.now()).toBeGreaterThan(start + 50)
    expect(Date.now()).toBeLessThan(start + 500)
    console.log({ duration: Date.now() - start })

    // The value is a Uint8Array of the bytes
    expect(value).toContain('0'.charCodeAt(0))

    expect(done).toBe(false)
  })
}
