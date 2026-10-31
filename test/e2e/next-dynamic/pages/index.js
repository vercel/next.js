import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'
import FourDirect from '../components/four'

const One = dynamic(() => import('../components/one'))
const Two = dynamic(() => import('../components/two'))
const Three = dynamic(() => import('../components/three'))
const Four = dynamic(() => import('../components/four'))

if (typeof window !== 'undefined') {
  window.caughtErrors = ''
  const origError = console.error

  console.error = function (...args) {
    window.caughtErrors += args.join(' ')
    origError(...args)
  }
}

export default () => {
  const [firstRender, setFirstRender] = useState('the-server-value')
  useEffect(() => {
    setFirstRender(document.getElementById('foo').innerHTML)
  }, [])

  return (
    <>
      <div id="foo">
        Index
        <One />
        <Two />
        <Three />
        <Four />
        <FourDirect />
      </div>
      <div id="first-render">{firstRender}</div>
    </>
  )
}
