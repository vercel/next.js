'use client'

import { useState } from 'react'

export function DirectCssDemo() {
  const [result, setResult] = useState('direct CSS idle')
  const [moduleClass, setModuleClass] = useState('')

  return (
    <>
      <button
        id="load-direct-css"
        onClick={async () => {
          await import('../direct.css')
          setResult(
            getComputedStyle(document.querySelector('#direct-css-result')!)
              .color
          )
        }}
      >
        load direct CSS
      </button>
      <p className="direct-css-target" id="direct-css-result">
        {result}
      </p>
      <button
        id="load-direct-css-module"
        onClick={async () => {
          const namespace = await import('../direct.module.css')
          setModuleClass(namespace.default.target)
        }}
      >
        load direct CSS Module
      </button>
      <p className={moduleClass} id="direct-css-module-result">
        {moduleClass || 'direct CSS Module idle'}
      </p>
    </>
  )
}
