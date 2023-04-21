import { useEffect } from 'react'

export default function Foo() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return 'foo'
}

function runTests() {
  it('it should display foo, not index', () => {
    expect(document.getElementById('__next').textContent).toBe('foo')
  })
}
