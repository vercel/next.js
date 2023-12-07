import type arg from 'next/dist/compiled/arg/index.js'

export const validArgs: arg.Spec = {
  // Types
  '--help': Boolean,
  '--port': Number,
  '--hostname': String,
  '--keepAliveTimeout': Number,
  '--experimental-test-proxy': Boolean,

  // Aliases
  '-h': '--help',
  '-p': '--port',
  '-H': '--hostname',
}
