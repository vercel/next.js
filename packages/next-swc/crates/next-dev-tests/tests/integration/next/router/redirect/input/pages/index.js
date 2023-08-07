import { useTestHarness } from '@turbo/pack-test-harness'

export default function Foo() {
  useTestHarness(runTests)

  return 'index'
}

function runTests() {
  it('it should display foo, not index', async () => {
    const res = await fetch('/foo')
    expect(res.url).toBe('https://example.vercel.sh/')
  })
}
