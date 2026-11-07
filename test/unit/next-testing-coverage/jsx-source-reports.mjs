import { runTypedCoverageReport } from './typed-coverage-report-runner.mjs'

await runTypedCoverageReport({
  fixtureFile: 'jsx-source-pristine.json',
  prefix: '.next-istanbul-jsx-source-',
  label: 'actual Istanbul JSX subject ',
})
