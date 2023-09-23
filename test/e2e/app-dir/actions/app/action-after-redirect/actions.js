'use server'

export async function expensiveCalculation() {
  // sleep for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return Math.random()
}
