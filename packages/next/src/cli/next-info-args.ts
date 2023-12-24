import type arg from 'next/dist/compiled/arg/index.js'

/**
 * Supported CLI arguments.
 */
export const validArgs: arg.Spec = {
  // Types
  '--help': Boolean,
  // Aliases
  '-h': '--help',
  // Detailed diagnostics
  '--verbose': Boolean,
}
