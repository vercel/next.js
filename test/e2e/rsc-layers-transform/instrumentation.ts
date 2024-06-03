import React from 'react'
import { textValue } from './lib/shared-module'

export async function register() {
  // TODO: support react-server condition for instrumentation hook in turbopack
  if (!process.env.TURBOPACK && Object(React).useState) {
    throw new Error('instrumentation is not working correctly in server layer')
  }
  console.log('instrumentation:register')
  console.log('instrumentation:text:' + textValue)
}
