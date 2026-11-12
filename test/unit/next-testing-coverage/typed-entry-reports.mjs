import { runTypedCoverageReport } from './typed-coverage-report-runner.mjs'

await runTypedCoverageReport({
  fixtureFile: 'typed-entry-pristine.json',
  prefix: '.next-istanbul-typed-entry-',
  label: 'actual Istanbul typed entry ',
  missing: 'Missing genuine typed-entry profile',
})
