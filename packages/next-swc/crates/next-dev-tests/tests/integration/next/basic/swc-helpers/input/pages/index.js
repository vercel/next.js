import { useTestHarness } from '@turbo/pack-test-harness'

export default function Page() {
  useTestHarness(runTests)

  const props1 = { className: 'foo' }
  const props2 = { style: { color: 'red' } }
  // this will require the `_extends` helper on SSR
  return (
    <div id="test" {...props1} {...props2}>
      Hello World
    </div>
  )
}

function runTests() {
  it('should render the #test element in red and with class foo', () => {
    const el = document.getElementById('test')
    expect(el.style.color).toBe('red')
    expect(el.className).toBe('foo')
  })
}
