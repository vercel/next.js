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
    const res = await fetch('/foo')
    expect(res.headers.get('x-foo')).toBe('bar')
  })
}
