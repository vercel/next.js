import type arg from 'next/dist/compiled/arg'

export const validEslintArgs = {
  // Types
  '--config': String,
  '--ext': [String],
  '--resolve-plugins-relative-to': String,
  '--rulesdir': [String],
  '--fix': Boolean,
  '--fix-type': [String],
  '--ignore-path': String,
  '--no-ignore': Boolean,
  '--quiet': Boolean,
  '--max-warnings': Number,
  '--no-inline-config': Boolean,
  '--report-unused-disable-directives': String,
  '--cache': Boolean, // Although cache is enabled by default, this dummy flag still exists to not cause any breaking changes
  '--no-cache': Boolean,
  '--cache-location': String,
  '--cache-strategy': String,
  '--error-on-unmatched-pattern': Boolean,
  '--format': String,
  '--output-file': String,

  // Aliases
  '-c': '--config',
  '-f': '--format',
  '-o': '--output-file',
} satisfies arg.Spec

export const validArgs = {
  // Types
  '--help': Boolean,
  '--base-dir': String,
  '--dir': [String],
  '--file': [String],
  '--strict': Boolean,

  // Aliases
  '-h': '--help',
  '-b': '--base-dir',
  '-d': '--dir',
  ...validEslintArgs,
} satisfies arg.Spec
