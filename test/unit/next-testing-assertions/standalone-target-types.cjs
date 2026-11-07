const { verifyTypePrograms } = require('./type-programs.cjs')

verifyTypePrograms('standalone-target-types', {
  typeOnly: true,
  capture: true,
  noDependencies:
    /[\\/]node_modules[\\/](?:vitest|vite|pretty-format|@vitest)[\\/]/,
  summary: {
    programs: 18,
    accepted: 9,
    rejected: 9,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    taskStateUnionIdentity: true,
    executionAndTryFieldIdentities: true,
    noVitestViteFormatterDependencies: true,
    typeOnlyImports: true,
  },
})
