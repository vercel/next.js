// Test that lazy async initialization patterns work correctly
// This ensures conditional guards are preserved and don't get optimized away incorrectly

let initPromise = null
let callCount = 0

async function doInit() {
  callCount++
}

function initAsync() {
  if (!initPromise) {
    initPromise = doInit()
  }
  return initPromise
}

it('should only initialize once when called multiple times', async () => {
  // Reset state
  initPromise = null
  callCount = 0

  // Call multiple times
  const promise1 = initAsync()
  const promise2 = initAsync()
  const promise3 = initAsync()

  // All should return the same promise instance
  expect(promise1).toBe(promise2)
  expect(promise2).toBe(promise3)

  // Wait for all to resolve
  await Promise.all([promise1, promise2, promise3])

  // Should have only called the expensive init once
  expect(callCount).toBe(1)
})
