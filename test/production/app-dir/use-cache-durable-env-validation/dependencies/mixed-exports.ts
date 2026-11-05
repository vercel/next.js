export function stable() {
  return process.env.STABLE_DURABLE_TEST
}

export function unrelatedUnstable() {
  return process.env.UNSTABLE_DURABLE_TEST
}
