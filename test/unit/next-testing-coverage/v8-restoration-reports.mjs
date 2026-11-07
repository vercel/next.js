import { runCollectionCoverageReport } from './collection-coverage-reports.mjs'

await runCollectionCoverageReport({
  fixtureName: 'v8-restoration-pristine.json',
  prefix: '.next-v8-restoration-public-',
  label: 'V8 settled restoration',
  allowMissingTrace: true,
  allowSnapshotStatisticsGap: false,
  additionalFailureChecks: { actualSettledRestorationFailure: true },
  completionFlags: {
    actualSetupModuleCollection: true,
  },
})
