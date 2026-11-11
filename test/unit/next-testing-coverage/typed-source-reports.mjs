import { runTypedCoverageReport } from './typed-coverage-report-runner.mjs'

await runTypedCoverageReport({
  fixtureFile: 'typed-source-pristine.json',
  prefix: '.next-istanbul-typed-source-',
  label: 'actual Istanbul typed subject ',
})
