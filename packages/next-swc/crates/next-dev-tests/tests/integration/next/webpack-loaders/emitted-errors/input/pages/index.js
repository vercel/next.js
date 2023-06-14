import { useTestHarness } from '@turbo/pack-test-harness'
import source from './hello.emit'

export default function Home() {
  useTestHarness(runTests)

  return null
}

function runTests() {
  it('runs a simple loader', () => {
    // Emitted issues are snapshot in `issues/`
    expect(source).toBe(null)
  })
}
