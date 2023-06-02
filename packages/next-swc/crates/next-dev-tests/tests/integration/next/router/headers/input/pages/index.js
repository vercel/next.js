import { useTestHarness } from '@turbo/pack-test-harness'

export default function Foo() {
  useTestHarness(runTests)

  return 'index'
}

function runTests() {
  it('should set header onto response', async () => {
    const res = await fetch('/foo')
    expect(res.headers.get('x-foo')).toBe('bar')
  })
}
