import {
  customCoverage,
  includeFlags,
  reporterFlags,
  standardCoverage,
  verifyCoverageOptions,
} from './provider-options-fixture.mjs'

const override = ['--coverage.provider=v8', ...includeFlags, ...reporterFlags]
await verifyCoverageOptions(
  [
    {
      name: 'standard-provider',
      coverage: standardCoverage(true),
      flags: ['--coverage.provider=v8'],
      outputs: 'full',
      text: true,
      retainPreviousReport: true,
    },
    {
      name: 'standard-disabled-provider',
      coverage: standardCoverage(false),
      flags: ['--coverage.provider=v8'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'standard-provider-cli-reporter',
      coverage: standardCoverage(true),
      flags: ['--coverage.provider=v8', '--coverage.reporter=json'],
      outputs: 'json',
      retainPreviousReport: true,
    },
    {
      name: 'custom-provider',
      coverage: customCoverage(true, './coverage-provider.mjs'),
      flags: override,
      outputs: 'full',
      text: true,
      retainPreviousReport: true,
    },
    {
      name: 'custom-missing-provider',
      coverage: customCoverage(true),
      flags: override,
      outputs: 'full',
      text: true,
      retainPreviousReport: true,
    },
    {
      name: 'custom-disabled-provider',
      coverage: customCoverage(false),
      flags: override,
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'custom-disabled-explicit-false',
      coverage: customCoverage(false),
      flags: [...override, '--no-coverage'],
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'custom-cli-directory',
      coverage: {
        ...customCoverage(true, './coverage-provider.mjs'),
        clean: true,
      },
      directory: 'cli-reports',
      flags: [...override, '--coverage.reportsDirectory=cli-reports'],
      outputs: 'full',
      text: true,
    },
    {
      name: 'no-config-provider-only',
      flags: override,
      outputs: 'none',
      retainPreviousReport: true,
    },
    {
      name: 'no-config-explicit-enable',
      flags: ['--coverage', ...override],
      outputs: 'full',
      text: true,
    },
    {
      name: 'standard-disabled-explicit-enable',
      coverage: standardCoverage(false),
      flags: ['--coverage', '--coverage.provider=v8'],
      outputs: 'full',
      text: true,
      retainPreviousReport: true,
    },
    {
      name: 'custom-disabled-explicit-enable',
      coverage: customCoverage(false),
      flags: ['--coverage', ...override],
      outputs: 'full',
      text: true,
      retainPreviousReport: true,
    },
    {
      name: 'standard-implicit-disabled-provider',
      coverage: standardCoverage(),
      flags: ['--coverage.provider=v8'],
      outputs: 'none',
      retainPreviousReport: true,
    },
  ],
  { seedPreviousReport: true }
)
