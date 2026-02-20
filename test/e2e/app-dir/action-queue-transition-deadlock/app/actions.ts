'use server'

export async function slowServerAction() {
  // Simulate a slow server action (longer delay to ensure second click happens while pending)
  await new Promise((resolve) => setTimeout(resolve, 2000))
  return { success: true }
}
