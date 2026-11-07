import { runCollectionCoverageReport } from './collection-coverage-reports.mjs'

await runCollectionCoverageReport({
  fixtureName: 'v8-declaration-pristine.json',
  prefix: '.next-v8-declaration-public-',
  label: 'V8 settled declaration',
  allowMissingTrace: true,
  additionalFailureChecks: { actualSettledDeclarationFailure: true },
  completionFlags: {
    actualSpecModuleCollection: true,
  },
})
