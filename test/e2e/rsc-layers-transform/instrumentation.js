import React from 'react'
import { textValue } from './lib/shared-module'

export async function register() {
  if (Object(React).useState) {
    throw new Error('instrumentation is not working correctly in server layer')
  }
  console.log('instrumentation:register')
  console.log('instrumentation:text:' + textValue)
}
