import { runCollectionCoverageReport } from './collection-coverage-reports.mjs'

await runCollectionCoverageReport({
  fixtureName: 'v8-collection-pristine.json',
  prefix: '.next-v8-collection-public-',
  label: 'V8 collection',
})
