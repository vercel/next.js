const { verifyTypePrograms } = require('./type-programs.cjs')

verifyTypePrograms('snapshot-root-exports', {
  typeOnly: true,
  capture: true,
  noDependencies:
    /[\\/]node_modules[\\/](?:vitest|vite|pretty-format|@vitest)[\\/]/,
  summary: {
    programs: 20,
    accepted: 8,
    rejected: 12,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    transitiveSnapshotTypeIdentity: true,
    serializerOverloadContracts: true,
    noVitestViteFormatterDependencies: true,
    typeOnlyImports: true,
  },
})
