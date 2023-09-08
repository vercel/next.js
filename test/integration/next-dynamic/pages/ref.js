import dynamic from 'next/dynamic'
import { useState, useEffect, useRef } from 'react'

const One = dynamic(() => import('../components/RefOne'))

if (typeof window !== 'undefined') {
  window.caughtErrors = ''
  const origError = console.error

  console.error = function (...args) {
    window.caughtErrors += args.join(' ')
    origError(...args)
  }
}

export default () => {
  const ref = useRef()
  const [firstRender, setFirstRender] = useState('the-server-value')

  useEffect(() => {
    if (ref.current) setFirstRender(ref.current.innerHTML)
  }, [])

  return (
    <>
      <One ref={ref}>
        <div>Ref</div>
      </One>
      <div id="first-render">{firstRender}</div>
    </>
  )
}
