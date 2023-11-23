import type arg from 'next/dist/compiled/arg'

export const validArgs = {
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
} satisfies arg.Spec
