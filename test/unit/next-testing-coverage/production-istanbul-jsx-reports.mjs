import { runTypedCoverageReport } from './typed-coverage-report-runner.mjs'

await runTypedCoverageReport({
  fixtureFile: 'production-jsx-pristine.json',
  prefix: '.next-istanbul-production-jsx-',
  label: 'actual production intrinsic JSX subject ',
  mode: 'production',
})
