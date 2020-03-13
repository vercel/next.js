import dynamic from 'next/dynamic'
import { useState, useEffect } from 'react'

const One = dynamic(() => import('../components/one'))
const Two = dynamic(() => import('../components/two'))
const Three = dynamic(() => import('../components/three'))

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
      </div>
      <div id="first-render">{firstRender}</div>
    </>
  )
}
