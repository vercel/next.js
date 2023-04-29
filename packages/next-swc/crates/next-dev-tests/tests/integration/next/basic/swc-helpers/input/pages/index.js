import { useEffect } from 'react'

export default function Page() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

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
