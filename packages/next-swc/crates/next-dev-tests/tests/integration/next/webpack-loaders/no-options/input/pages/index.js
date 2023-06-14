import { useTestHarness } from '@turbo/pack-test-harness'
import source1 from './hello.raw'
import source2 from '../raw/hello.js'
import source3 from './hello.raw.raw'
import source4 from './hello.raw.js'
import source5 from './hello.jraw'

export default function Home() {
  useTestHarness(runTests)

  return null
}

function runTests() {
  it('runs a simple loader', () => {
    expect(source1).toBe('Hello World')
  })
  it('runs a loader matching relative path glob', () => {
    expect(source2).toBe('}}} Hello World')
  })
  it('runs a loader with "as" continue (to other match)', () => {
    expect(source3).toBe('export default "Hello World";')
  })
  it('runs a loader with "as" continue (to default js match)', () => {
    expect(source4).toBe('Hello World')
  })
  it('runs a loader with "as" to builtin type', () => {
    expect(source5).toBe('Hello World')
  })
}
