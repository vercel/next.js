'use cache: remote, durable'

export async function getValue() {
  return process.env.UNSTABLE_DURABLE_TEST
}
