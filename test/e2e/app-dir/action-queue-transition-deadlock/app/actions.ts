'use server'

export async function slowServerAction() {
  // Simulate a slow server action
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { success: true }
}
