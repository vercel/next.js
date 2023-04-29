import dynamic from 'next/dynamic'
import { useState, useEffect, useRef } from 'react'

const OneNoSsr = dynamic(() => import('../components/RefOne'), {
  ssr: false,
})

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
    const timeout = setTimeout(() => {
      if (ref.current) setFirstRender(ref.current.innerHTML)
    }, 500)
    return () => {
      clearTimeout(timeout)
    }
  }, [])

  return (
    <>
      <OneNoSsr ref={ref}>
        <div>Ref</div>
      </OneNoSsr>
      <div id="first-render">{firstRender}</div>
    </>
  )
}
