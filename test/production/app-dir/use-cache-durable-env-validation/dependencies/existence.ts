export function hasEnv() {
  if (process.env.UNSTABLE_DURABLE_TEST_EXISTENCE) {
    return true
  }
  return false
}
