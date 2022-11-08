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

const BEFORE_HYDRATION =
  typeof document !== 'undefined' && document.getElementById('foo').innerHTML

const Index = () => {
  const [firstRender, setFirstRender] = useState('the-server-value')
  const [beforeHydration, setBeforeHydration] = useState(
    'the-second-server-value'
  )
  useEffect(() => {
    setFirstRender(document.getElementById('foo').innerHTML)
    setBeforeHydration(BEFORE_HYDRATION)
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
      <div id="before-hydration">{beforeHydration}</div>
    </>
  )
}
export default Index
