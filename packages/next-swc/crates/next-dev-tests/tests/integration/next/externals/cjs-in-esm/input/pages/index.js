import value from 'package'
import value2 from 'package/cjs'
import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness(runTests)

  return (
    <div id="ssr">
      {value} {value2}
    </div>
  )
}

function runTests() {
  it('can handle esm packages importing cjs local files', () => {
    expect(value).toBe(42)
    expect(value2).toBe(42)
    expect(document.getElementById('ssr').textContent).toBe('42 42')
  })
}
