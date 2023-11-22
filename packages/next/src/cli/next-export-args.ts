import type arg from 'next/dist/compiled/arg/index.js'

export const validArgs: arg.Spec = {
  // Types
  '--help': Boolean,
  '--silent': Boolean,
  '--outdir': String,
  '--threads': Number,

  // Aliases
  '-h': '--help',
  '-o': '--outdir',
  '-s': '--silent',
}
