import React from 'react'
// TODO: support react client transform in turbopack
// import { textValue } from './lib/mixed-lib/shared-module'

export async function register() {
  if (Object(React).useState) {
    throw new Error('instrumentation is not working correctly in server layer')
  }
  console.log('instrumentation:register')
}
