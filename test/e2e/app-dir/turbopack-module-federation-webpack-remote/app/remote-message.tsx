'use client'

import { useEffect, useState } from 'react'
// @ts-expect-error -- configured as an eager shared module
import { value as eagerValue } from 'eager-local'

export function RemoteMessage() {
  const [message, setMessage] = useState('loading')
  const [shared, setShared] = useState('loading')
  const [remoteShared, setRemoteShared] = useState('loading')
  const [strictError, setStrictError] = useState('loading')
  const [fallback, setFallback] = useState('loading')
  const [unionRange, setUnionRange] = useState('loading')
  const [hyphenRange, setHyphenRange] = useState('loading')
  const [caretRange, setCaretRange] = useState('loading')
  const [prefixFallback, setPrefixFallback] = useState('loading')

  useEffect(() => {
    async function load() {
      // @ts-expect-error -- configured with a local fallback at runtime
      const fallbackModule = await import('local-fallback')
      setFallback(fallbackModule.value)
      // @ts-expect-error -- matched by a trailing-slash shared prefix
      const prefixModule = await import('prefix/item')
      setPrefixFallback(prefixModule.value)
      // @ts-expect-error -- provided by Module Federation at runtime
      const remote = await import('catalog/message')
      setMessage(remote.message)
      setRemoteShared(remote.remoteShared)
      // @ts-expect-error -- provided by the configured share scope
      const unionModule = await import('range-union')
      setUnionRange(unionModule.value)
      // @ts-expect-error -- provided by the configured share scope
      const hyphenModule = await import('range-hyphen')
      setHyphenRange(hyphenModule.value)
      // @ts-expect-error -- provided by the configured share scope
      const caretModule = await import('range-v1')
      setCaretRange(caretModule.value)
      // @ts-expect-error -- provided by the remote share scope at runtime
      const sharedModule = await import('remote-shared')
      setShared(sharedModule.value)
      try {
        // @ts-expect-error -- configured to exercise a strict version mismatch
        await import('strict-remote-shared')
      } catch (error) {
        setStrictError((error as Error).message)
      }
    }
    load()
  }, [])

  return (
    <>
      <p id="remote-message">{message}</p>
      <p id="shared-message">{shared}</p>
      <p id="remote-shared-message">{remoteShared}</p>
      <p id="strict-error">{strictError}</p>
      <p id="fallback-message">{fallback}</p>
      <p id="union-range">{unionRange}</p>
      <p id="hyphen-range">{hyphenRange}</p>
      <p id="caret-range">{caretRange}</p>
      <p id="prefix-fallback">{prefixFallback}</p>
      <p id="eager-value">{eagerValue}</p>
    </>
  )
}
