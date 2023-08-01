import { useTestHarness } from '@turbo/pack-test-harness'

export default function Foo() {
  useTestHarness(runTests)

  return 'index'
}

function runTests() {
  it('should stream middleware response from node', async () => {
    const res = await fetch('/headers')
    const json = await res.json()

    const { host, port, proto } = json
    expect(host).toBe(`localhost:${port}`)
    expect(port).toMatch(/\d+/)
    expect(proto).toBe('http')
  })
}
