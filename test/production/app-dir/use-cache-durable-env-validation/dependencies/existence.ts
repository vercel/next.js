export function hasEnv() {
  if (process.env.UNSTABLE_DURABLE_TEST) {
    return true
  }
  return false
}
