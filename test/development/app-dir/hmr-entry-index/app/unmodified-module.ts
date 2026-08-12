// An always-imported dependency that is never edited during the test.
// Its evaluation timestamp detects a server runtime clear/full re-evaluation.
export const depEvalTime = Date.now()
