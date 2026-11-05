import {
  includeFlags,
  standardCoverage,
  verifyCoverageOptions,
} from './provider-options-fixture.mjs'

await verifyCoverageOptions(
  [
    {
      name: 'standard-disabled-reporter-only',
      coverage: standardCoverage(false),
      flags: ['--coverage.reporter=json'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'no-config-reporter-only',
      flags: ['--coverage.reporter=json'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'authored-enabled-reporter-only',
      coverage: standardCoverage(true),
      flags: ['--coverage.reporter=json'],
      outputs: 'json',
      retainPreviousReport: true,
    },
    {
      name: 'authored-disabled-include-only',
      coverage: standardCoverage(false),
      flags: ['--coverage.include=subject.mjs'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'no-config-include-only',
      flags: ['--coverage.include=subject.mjs'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'authored-disabled-threshold-only',
      coverage: standardCoverage(false),
      flags: ['--coverage.thresholds.lines=99'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'no-config-threshold-only',
      flags: ['--coverage.thresholds.lines=99'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'authored-disabled-explicit-enable-json',
      coverage: standardCoverage(false),
      flags: ['--coverage', '--coverage.reporter=json'],
      outputs: 'json',
      retainPreviousReport: true,
    },
    {
      name: 'no-config-explicit-enable-json',
      flags: ['--coverage', '--coverage.reporter=json', ...includeFlags],
      outputs: 'json',
    },
    {
      name: 'authored-enabled-threshold99',
      coverage: standardCoverage(true),
      flags: ['--coverage.thresholds.lines=99'],
      outputs: 'full',
      text: true,
      retainPreviousReport: true,
      exitCode: 1,
    },
    {
      name: 'explicit-disabled-last',
      coverage: standardCoverage(true),
      flags: ['--coverage', '--no-coverage', '--coverage.reporter=json'],
      outputs: 'none',
      retainPreviousReport: true,
    },
  ],
  { seedPreviousReport: true }
)
