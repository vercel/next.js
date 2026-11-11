const { verifyTypePrograms } = require('./type-programs.cjs')

verifyTypePrograms('root-authoring-types', {
  paths: ({ packageDir }) => ({
    'actual-bundled': [
      require('node:path').join(
        packageDir,
        'dist/compiled/next-test-primitives/index.d.ts'
      ),
    ],
  }),
  summary: {
    programs: 24,
    accepted: 6,
    rejected: 18,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    transitiveSnapshotTypeIdentity: true,
    typeOnlyExports: true,
  },
})
