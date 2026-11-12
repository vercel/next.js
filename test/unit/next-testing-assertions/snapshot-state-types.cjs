const { verifyTypePrograms } = require('./type-programs.cjs')

verifyTypePrograms('snapshot-state-types', {
  summary: {
    programs: 18,
    accepted: 12,
    rejected: 6,
    rootConfigAndGlobalAugmentations: true,
    publishedFacadeTarget: true,
    globalContextCustomMatcherAndStateWrites: true,
    actualBundledSnapshotType: true,
  },
})
