import { useTestHarness } from '@turbo/pack-test-harness'
import source from './hello.replace'

export default function Home() {
  useTestHarness(runTests)

  return null
}

function runTests() {
  it('runs a loader with basic options', () => {
    expect(source).toBe(3)
  })
}
