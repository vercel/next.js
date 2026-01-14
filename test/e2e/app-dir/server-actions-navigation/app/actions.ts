'use server'

export async function delayedAction(): Promise<string> {
  // Artificial delay to force race with navigation
  await new Promise((resolve) => setTimeout(resolve, 500))

  return 'STALE_RESULT'
}
