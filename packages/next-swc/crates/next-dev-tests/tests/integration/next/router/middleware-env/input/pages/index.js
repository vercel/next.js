import { useEffect } from 'react'

export default function Foo() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return 'index'
}

function runTests() {
  it('should include custom env fields in middleware process', async () => {
    const res = await fetch('/body')
    const env = await res.json()
    expect(env).toHaveProperty('CUSTOM_ENV', 'foobar')
  })
}
