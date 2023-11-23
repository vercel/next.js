import type arg from 'next/dist/compiled/arg'

export const validArgs = {
  // Types
  '--help': Boolean,
  '--silent': Boolean,
  '--outdir': String,
  '--threads': Number,

  // Aliases
  '-h': '--help',
  '-o': '--outdir',
  '-s': '--silent',
} satisfies arg.Spec
