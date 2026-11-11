import { runTypedCoverageReport } from './typed-coverage-report-runner.mjs'

await runTypedCoverageReport({
  fixtureFile: process.argv.includes('--poison')
    ? 'production-js-poison-pristine.json'
    : 'production-js-pristine.json',
  prefix: '.next-istanbul-production-js-',
  label: 'actual production Istanbul subject ',
  missing: 'Missing genuine production profile',
  mode: 'production',
  lifecycle: true,
})
