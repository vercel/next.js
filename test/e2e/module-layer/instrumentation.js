import { textValue } from './lib/mixed-lib/shared-module'

export async function register() {
  if (typeof textValue !== 'string') {
    throw new Error('textValue is not a string')
  }
  console.log('instrumentation:register')
}
