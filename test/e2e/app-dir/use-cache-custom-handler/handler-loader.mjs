import handler from './handler.js'

if (process.env.NEXT_TEST_FAIL_CUSTOM_CACHE_HANDLER === '1') {
  throw new Error('test custom cache handler failed to load')
}

// Widen the registration window for the first-request race test.
await new Promise((resolve) => setTimeout(resolve, 500))

export default handler
