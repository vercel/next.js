'use server'

// Return a value that is unique per call instead of keeping a module-level
// counter. A counter only works when a single server instance handles every
// request; behind a load balancer each instance has its own counter.
export async function incrementCounter() {
  console.log('Button clicked!')

  return crypto.randomUUID()
}
