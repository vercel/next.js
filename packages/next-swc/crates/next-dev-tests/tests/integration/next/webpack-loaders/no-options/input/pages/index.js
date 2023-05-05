import { useTestHarness } from '@turbo/pack-test-harness'
import source from './hello.raw'

export default function Home() {
  useTestHarness(runTests)

  return null
}

function runTests() {
  it('runs a simple loader', () => {
    expect(source).toBe('Hello World')
  })
}
