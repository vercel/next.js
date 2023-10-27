import type arg from 'next/dist/compiled/arg/index.js'

export const validArgs: arg.Spec = {
  // Types
  '--enable': Boolean,
  '--disable': Boolean,
  '--help': Boolean,
  // Aliases
  '-h': '--help',
}
