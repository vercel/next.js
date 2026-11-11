import {
  includeFlags,
  verifyCoverageOptions,
} from './provider-options-fixture.mjs'

await verifyCoverageOptions([
  {
    name: 'provider-default',
    flags: ['--coverage', '--coverage.provider=v8', ...includeFlags],
    outputs: 'default',
    text: true,
  },
  {
    name: 'provider-json',
    flags: [
      '--coverage',
      '--coverage.provider=v8',
      '--coverage.reporter=json',
      ...includeFlags,
    ],
    outputs: 'json',
  },
  {
    name: 'provider-text-json',
    flags: [
      '--coverage',
      '--coverage.provider=v8',
      '--coverage.reporter=text',
      '--coverage.reporter=json',
      ...includeFlags,
    ],
    outputs: 'json',
    text: true,
  },
  {
    name: 'implicit-v8-text-json',
    flags: [
      '--coverage',
      '--coverage.reporter=text',
      '--coverage.reporter=json',
      ...includeFlags,
    ],
    outputs: 'json',
    text: true,
  },
  {
    name: 'provider-text-only',
    flags: [
      '--coverage',
      '--coverage.provider=v8',
      '--coverage.reporter=text',
      ...includeFlags,
    ],
    outputs: 'none',
    text: true,
  },
  {
    name: 'disabled-provider',
    flags: ['--no-coverage', '--coverage.provider=v8', ...includeFlags],
    outputs: 'none',
  },
  {
    name: 'implicit-v8-html-json',
    flags: [
      '--coverage',
      '--coverage.reporter=html',
      '--coverage.reporter=json',
      ...includeFlags,
    ],
    outputs: 'html-json',
  },
  {
    name: 'implicit-v8-clover-json',
    flags: [
      '--coverage',
      '--coverage.reporter=clover',
      '--coverage.reporter=json',
      ...includeFlags,
    ],
    outputs: 'clover-json',
  },
])
