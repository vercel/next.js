'use client'
import React from 'react'
import Link from 'next/link'
import { useCallback, useRef, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export default function Page() {
  const [isVisible, setIsVisible] = useState(true)

  const statusRef = useRef({ wasInitialized: false, wasCleanedUp: false })

  const refWithCleanup = useCallback((el) => {
    if (!el) {
      console.error(
        'callback refs that returned a cleanup should never be called with null'
      )
      return
    }

    statusRef.current.wasInitialized = true
    return () => {
      statusRef.current.wasCleanedUp = true
    }
  }, [])

  useEffect(() => {
    const timeout = setTimeout(
      () => {
        flushSync(() => {
          setIsVisible(false)
        })
        if (!statusRef.current.wasInitialized) {
          console.error('callback ref was not initialized')
        }
        if (!statusRef.current.wasCleanedUp) {
          console.error('callback ref was not cleaned up')
        }
      },
      100 // if we hide the Link too quickly, the prefetch won't fire, failing a test
    )
    return () => clearTimeout(timeout)
  }, [])

  if (!isVisible) {
    return null
  }

  return (
    <Link href="/" ref={refWithCleanup}>
      Click me
    </Link>
  )
}
