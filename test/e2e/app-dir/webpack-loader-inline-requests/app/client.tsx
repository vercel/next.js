'use client'

import { useEffect, useState } from 'react'
import '../fixtures/styles.browser-style'
import '../fixtures/other.browser-style'
import '../fixtures/legacy.global-script'
import '../fixtures/value.exposed'
import isomorphic from '../fixtures/styles.isomorphic-style'
import '../fixtures/styles.universal-style'
import requests from '../fixtures/input.requestgen'

export default function Client() {
  const [value, setValue] = useState('')
  const [webComponentCss, setWebComponentCss] = useState('')
  useEffect(() => {
    setValue(
      JSON.stringify({
        script: window.inlineLoaderScript,
        exposed: window.inlineLoaderExposed,
      })
    )
    const remove = isomorphic._insertCss()
    import('../fixtures/styles.web-component-style').then(async () => {
      const exports = await import('react-web-component-style-loader/exports')
      setWebComponentCss(
        exports.styleElements.map((element) => element.textContent).join('\n')
      )
    })
    return remove
  }, [])
  return (
    <>
      <p id="inline-style">{value}</p>
      <p id="inline-style-other">other style</p>
      <p id="isomorphic-style">isomorphic</p>
      <p id="universal-style">universal</p>
      <pre id="web-component-css">{webComponentCss}</pre>
      <pre id="client-requests">{JSON.stringify(requests)}</pre>
    </>
  )
}
