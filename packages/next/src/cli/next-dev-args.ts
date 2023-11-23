import type arg from 'next/dist/compiled/arg'

export const validArgs = {
  // Types
  '--help': Boolean,
  '--port': Number,
  '--hostname': String,
  '--turbo': Boolean,
  '--experimental-https': Boolean,
  '--experimental-https-key': String,
  '--experimental-https-cert': String,
  '--experimental-https-ca': String,
  '--experimental-test-proxy': Boolean,
  '--experimental-upload-trace': String,

  // To align current messages with native binary.
  // Will need to adjust subcommand later.
  '--show-all': Boolean,
  '--root': String,

  // Aliases
  '-h': '--help',
  '-p': '--port',
  '-H': '--hostname',
} satisfies arg.Spec
