import { useTestHarness, Harness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness(runTests)

  return <h1>Ready</h1>
}

let once = true
function runTests(harness: Harness) {
  if (!once) return
  once = false
  it('should run a basic API request', async () => {
    const res = await fetch('/api/basic?input=test')
    const json = await res.json()
    expect(json).toEqual({ hello: 'world', input: 'test' })
  })

  it('should run a basic edge API request', async () => {
    const res = await fetch('/api/edge?input=test')
    const json = await res.json()
    expect(json).toEqual({ hello: 'world', input: 'test' })
  })

  it('should be able to use PORT and fetch from localhost', async () => {
    const res = await fetch('/api/localhost')
    const json = await res.json()
    expect(json).toEqual({ hello: 'world', input: 'test' })
  })

  it('should be able to use PORT and fetch from 127.0.0.1', async () => {
    const res = await fetch('/api/ipv4')
    const json = await res.json()
    expect(json).toEqual({ hello: 'world', input: 'test' })
  })

  it('should be able to use PORT and fetch from [::1]', async () => {
    const res = await fetch('/api/ipv6')
    const json = await res.json()
    expect(json).toEqual({ hello: 'world', input: 'test' })
  })
}
