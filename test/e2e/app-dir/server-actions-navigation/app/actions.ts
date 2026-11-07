'use server'

export async function runServerAction() {
  // Simulate a slow async server action
  await new Promise((resolve) => setTimeout(resolve, 3000))

  return 'STALE_RESULT'
}
