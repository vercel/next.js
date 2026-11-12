import { test } from 'vitest'
async function failAfterAwait() {
  await Promise.resolve()
  await {
    then(resolve) {
      resolve()
    },
  }
  throw new Error('browser async mapped failure')
}
test('mapped browser failure after native awaits', async () => {
  await failAfterAwait()
})
