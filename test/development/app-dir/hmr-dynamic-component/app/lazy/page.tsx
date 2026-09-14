'use client'
import dynamic from 'next/dynamic'
import { useState } from 'react'

const Dynamic = dynamic(() => import('../components/dynamic'))

export default function LazyPage() {
  const [show, setShow] = useState(false)
  return (
    <div>
      <button id="load-button" onClick={() => setShow(true)}>
        Load Component
      </button>
      {show && <Dynamic />}
    </div>
  )
}
