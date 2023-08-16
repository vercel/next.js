import { useTestHarness } from '@turbo/pack-test-harness'

export default function Foo() {
  useTestHarness(runTests)

  return 'foo'
}

function runTests() {
  it('it should display foo, not index', () => {
    expect(document.getElementById('__next').textContent).toBe('foo')
  })
}
