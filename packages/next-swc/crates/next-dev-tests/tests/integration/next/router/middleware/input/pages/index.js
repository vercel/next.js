import { useEffect } from 'react'

export default function Foo() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return 'index'
}

function runTests() {
  it('should stream middleware response from node', async () => {
    let start = Date.now()
    const res = await fetch('/stream')
    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    let data = ''
    let first = true
    while (true) {
      // we're only testing the timing
      const { value, done } = await reader.read()

      console.log({ data })
      if (first) {
        first = false
        // The body still stream for 1 second, we just want the first chunk
        // to be delivered within 500ms.
        expect(Date.now()).toBeGreaterThan(start + 50)
        expect(Date.now()).toBeLessThan(start + 500)
        expect(done).toBe(false)
      }
      if (value) {
        data += decoder.decode(value, { stream: !done })
      }

      if (done) break
    }

    console.log({ data })
    expect(data).toBe('0123456789')
  })
}
