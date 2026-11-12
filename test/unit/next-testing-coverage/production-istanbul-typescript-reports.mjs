import { runTypedCoverageReport } from './typed-coverage-report-runner.mjs'

await runTypedCoverageReport({
  fixtureFile: 'production-typescript-pristine.json',
  prefix: '.next-istanbul-production-typescript-',
  label: 'actual ordinary production TypeScript subject ',
  mode: 'production',
})
