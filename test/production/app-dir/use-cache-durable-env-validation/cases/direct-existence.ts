export async function getValue() {
  'use cache: remote, durable'
  if (process.env.UNSTABLE_DURABLE_TEST) {
    return true
  }
  return false
}
