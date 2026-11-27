'use client'

import { useState } from 'react'
import defer * as lazy from '../../lib/browser-lazy'
import defer * as neverAccessed from '../../lib/throws-on-evaluation'

function getLog(): string[] {
  return (
    (globalThis as typeof globalThis & { __importDeferLog?: string[] })
      .__importDeferLog ?? []
  )
}

// Uses the deferred namespace as value (instead of only accessing a property).
function readValue(ns: { value: string }) {
  return ns.value
}

export function DeferredClient() {
  const [result, setResult] = useState('')
  const [namespaceResult, setNamespaceResult] = useState('')
  const [dynamicResult, setDynamicResult] = useState('')
  return (
    <>
      <button
        id="access-static"
        onClick={() => {
          const before = getLog().includes('browser-lazy')
          const value = lazy.value
          const after = getLog().includes('browser-lazy')
          setResult(`before:${before} value:${value} after:${after}`)
        }}
      >
        access static
      </button>
      <p id="static-result">{result}</p>
      <button
        id="access-namespace"
        onClick={() => {
          setNamespaceResult(readValue(lazy))
        }}
      >
        access namespace
      </button>
      <p id="namespace-result">{namespaceResult}</p>
      <button
        id="access-dynamic"
        onClick={async () => {
          const ns = await import.defer('../../lib/browser-dynamic')
          const loaded = getLog().includes('browser-dynamic')
          const value = ns.value
          const after = getLog().includes('browser-dynamic')
          setDynamicResult(`loaded:${loaded} value:${value} after:${after}`)
        }}
      >
        access dynamic
      </button>
      <p id="dynamic-result">{dynamicResult}</p>
      <button
        id="never-clicked"
        onClick={() => {
          // Keeps the deferred import alive, but is never clicked.
          console.log(neverAccessed.value)
        }}
      >
        never clicked
      </button>
    </>
  )
}
