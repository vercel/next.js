import { useEffect } from 'react'
import source from './hello.replace'

export default function Home() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  return null
}

function runTests() {
  it('runs a loader with basic options', () => {
    expect(source).toBe(3)
  })
}
