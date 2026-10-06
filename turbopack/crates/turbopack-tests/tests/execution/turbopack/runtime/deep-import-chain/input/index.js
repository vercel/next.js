// Test how many imports/requires can be stacked sequentially
// The actual limit varies slightly for esm and cjs (due to the async machinery).
// Turbopack doesn't guarantee any particular amount but we should try to avoid
// droppping below what nodejs supports natively.  So if a runtime refactoring
// requires this to drop that is OK.
const CHAIN_DEPTH = 1301

function evaluationFrames(kind) {
  return globalThis.__generatedChainEvaluationFrames?.[kind]
}

it(`evaluates a ${CHAIN_DEPTH} module import chain`, async () => {
  const { depth } = await import('generated-chain/esm/1300')
  expect(depth).toBe(CHAIN_DEPTH)
  // Each module was evaluated separately, through the runtime.
  expect(evaluationFrames('esm')).toBeGreaterThanOrEqual(CHAIN_DEPTH)
})

it(`evaluates a ${CHAIN_DEPTH} module require chain`, () => {
  const { depth } = require('generated-chain/cjs/1300')
  expect(depth).toBe(CHAIN_DEPTH)
  expect(evaluationFrames('cjs')).toBeGreaterThanOrEqual(CHAIN_DEPTH)
})
