import other from '../other'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Home() {
  useTestHarness(runTests)

  return null
}

function runTests() {
  it('automatically runs babel-loader if a babel config is present', () => {
    expect(other).toBe('foo')
  })
}
