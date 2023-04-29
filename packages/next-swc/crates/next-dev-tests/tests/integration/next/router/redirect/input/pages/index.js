import { useEffect } from 'react'

export default function Foo() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return 'index'
}

function runTests() {
  it('it should display foo, not index', async () => {
    const res = await fetch('/foo')
    expect(res.url).toBe('https://example.vercel.sh/')
  })
}
