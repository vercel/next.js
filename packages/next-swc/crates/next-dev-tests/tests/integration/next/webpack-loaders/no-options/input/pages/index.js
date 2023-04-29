import { useEffect } from 'react'
import source from './hello.raw'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return null
}

function runTests() {
  it('runs a simple loader', () => {
    expect(source).toBe('Hello World')
  })
}
