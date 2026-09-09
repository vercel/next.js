// An async function that returns a promise-returning call without awaiting it resolves to the
// inner value, not to a promise. Modelling that as `Promise<Promise<T>>` made awaiting it strip
// only one layer, so the result still looked like a promise — always truthy — and guards on it
// were folded away along with the code after them.
//
// Each guard below calls a concrete wrapper rather than a parameter, so the analyzer can
// resolve the call and the folding is actually exercised.

async function findRow() {
  return null
}

// Returns the promise from `findRow` without awaiting it.
async function findRowWrapped() {
  return findRow()
}

async function findRowWrappedTwice() {
  return findRowWrapped()
}

async function findRowConditional(useFirst) {
  return useFirst ? findRow() : findRowWrapped()
}

async function classifyWrapped() {
  const row = await findRowWrapped()
  if (row) {
    return 'found'
  }
  return 'missing'
}

async function classifyWrappedTwice() {
  const row = await findRowWrappedTwice()
  if (row) {
    return 'found'
  }
  return 'missing'
}

// `useFirst` stays an unresolved argument, so the ternary survives analysis instead of
// folding to one branch.
async function classifyConditional(useFirst) {
  const row = await findRowConditional(useFirst)
  if (row) {
    return 'found'
  }
  return 'missing'
}

it('should not take a guard on an awaited nested promise', async () => {
  const row = await findRowWrapped()
  expect(row).toBe(null)
  if (row) {
    throw new Error('guard on an awaited nested promise should not be taken')
  }
})

it('should keep the code after a guard that always returns', async () => {
  expect(await classifyWrapped()).toBe('missing')
})

it('should collapse more than one level of nesting', async () => {
  expect(await findRowWrappedTwice()).toBe(null)
  expect(await classifyWrappedTwice()).toBe('missing')
})

it('should collapse promises nested inside branches', async () => {
  expect(await findRowConditional(true)).toBe(null)
  expect(await findRowConditional(false)).toBe(null)
  expect(await classifyConditional(true)).toBe('missing')
  expect(await classifyConditional(false)).toBe('missing')
})

it('should still treat an un-awaited promise as truthy', async () => {
  const promise = findRowWrapped()
  let taken = false
  if (promise) {
    taken = true
  }
  expect(taken).toBe(true)
  expect(await promise).toBe(null)
})

// A union of promises with no enclosing async function: `await` has to unwrap each branch.
async function classifyBareAlternatives(useFirst) {
  const pending = useFirst ? findRow() : findRowWrapped()
  const row = await pending
  if (row) {
    return 'found'
  }
  return 'missing'
}

it('should distribute await over a union of promises', async () => {
  expect(await classifyBareAlternatives(true)).toBe('missing')
  expect(await classifyBareAlternatives(false)).toBe('missing')
})
