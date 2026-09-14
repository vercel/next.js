// An always-imported dependency that is never modified during the test.
// Its evaluation timestamp detects whether clear() fired.
export const depEvalTime = Date.now()
