import { useEffect } from 'react'
import source from './hello.emit'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return null
}

function runTests() {
  it('runs a simple loader', () => {
    // Emitted issues are snapshot in `issues/`
    expect(source).toBe(null)
  })
}
