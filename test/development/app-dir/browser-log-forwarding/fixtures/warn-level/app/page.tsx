'use client'

import { useInsertionEffect } from 'react'

export default function Page() {
  useInsertionEffect(() => {
    console.log('browser log: this is a log message')
    console.info('browser info: this is an info message')
    console.warn('browser warn: this is a warning message')
    console.error('browser error: this is an error message')
    console.debug('browser debug: this is a debug message')
  }, [])

  return <p>Browser Log Forwarding Test</p>
}
