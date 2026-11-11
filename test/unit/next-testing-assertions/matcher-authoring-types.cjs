const { verifyTypePrograms } = require('./type-programs.cjs')

verifyTypePrograms('matcher-authoring-types', {
  paths: ({ packageDir }) => ({
    'actual-origin': [
      require('node:fs').realpathSync(
        require('node:path').join(
          packageDir,
          'dist/experimental/testing/primitives/index.d.ts'
        )
      ),
    ],
  }),
  summary: {
    programs: 44,
    accepted: 16,
    rejected: 28,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    directRealMatcherTypeIdentity: true,
    typeOnlyExports: true,
  },
})
