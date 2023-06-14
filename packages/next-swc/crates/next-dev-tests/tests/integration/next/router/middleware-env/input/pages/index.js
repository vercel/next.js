import { useTestHarness } from '@turbo/pack-test-harness'

export default function Foo() {
  useTestHarness(runTests)

  return 'index'
}

function runTests() {
  it('should include custom env fields in middleware process', async () => {
    const res = await fetch('/body')
    const env = await res.json()
    expect(env).toHaveProperty('CUSTOM_ENV', 'foobar')
  })
}
