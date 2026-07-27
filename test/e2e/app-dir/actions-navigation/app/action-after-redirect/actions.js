'use server'

export async function expensiveCalculation() {
  console.log('server action invoked')
  // sleep for 1 second
  await new Promise((resolve) => setTimeout(resolve, 1000))

  return Math.random()
}
