// An always-imported dependency that is never modified during the test.
// Its evaluation timestamp is used to detect whether clear() fired: clear()
// wipes require.cache and re-evaluates every module, which would change this
// timestamp. A partial HMR apply leaves unmodified modules untouched.
export const depEvalTime = Date.now()
