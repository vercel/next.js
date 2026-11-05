'use cache: remote, durable'

export async function moduleDurable() {
  return process.env.STABLE_DURABLE_TEST
}
