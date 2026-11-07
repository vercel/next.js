import { runCollectionCoverageReport } from './collection-coverage-reports.mjs'

await runCollectionCoverageReport({
  fixtureName: 'spec-collection-pristine.json',
  prefix: '.next-istanbul-spec-collection-',
  label: 'Istanbul collection',
  allowSnapshotStatisticsGap: false,
  captureSnapshotStatisticsGap: false,
})
