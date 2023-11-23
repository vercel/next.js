import type arg from 'next/dist/compiled/arg'

/**
 * Supported CLI arguments.
 */
export const validArgs = {
  // Types
  '--help': Boolean,
  // Aliases
  '-h': '--help',
  // Detailed diagnostics
  '--verbose': Boolean,
} satisfies arg.Spec
