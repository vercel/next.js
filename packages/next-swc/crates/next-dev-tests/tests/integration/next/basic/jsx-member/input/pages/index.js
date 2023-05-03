import { useEffect } from 'react'
import * as Named from '../module.tsx'

export default function Page() {
  useEffect(() => {
    // Only run on client
    import('@turbo/pack-test-harness').then(runTests)
  })

  const object = { Named: Named.Named }
  const object2 = { Named }

  return (
    <>
      <Named.Named>Hello World</Named.Named>
      <object.Named>Hello There</object.Named>
      <object2.Named.Named>Hello You</object2.Named.Named>
    </>
  )
}

function runTests() {
  it('should render the element', () => {
    const html = document.body.innerHTML
    expect(html).toContain('Hello World')
    expect(html).toContain('Hello There')
    expect(html).toContain('Hello You')
  })
}
