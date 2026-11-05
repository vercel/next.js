export async function getValue() {
  'use cache: remote, durable'
  return process.env.UNSTABLE_DURABLE_TEST
}
