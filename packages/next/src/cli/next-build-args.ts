import type arg from 'next/dist/compiled/arg/index.js'

export const validArgs: arg.Spec = {
  // Types
  '--help': Boolean,
  '--profile': Boolean,
  '--debug': Boolean,
  '--no-lint': Boolean,
  '--no-mangling': Boolean,
  '--experimental-app-only': Boolean,
  '--experimental-turbo': Boolean,
  '--experimental-turbo-root': String,
  '--build-mode': String,
  // Aliases
  '-h': '--help',
  '-d': '--debug',
}
