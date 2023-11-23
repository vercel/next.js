import type arg from 'next/dist/compiled/arg'

export const validArgs = {
  // Types
  '--enable': Boolean,
  '--disable': Boolean,
  '--help': Boolean,
  // Aliases
  '-h': '--help',
} satisfies arg.Spec
