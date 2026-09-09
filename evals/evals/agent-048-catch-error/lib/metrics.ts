export async function getStats() {
  // Simulate a flaky upstream metrics service.
  await new Promise((resolve) => setTimeout(resolve, 50))
  if (Math.random() < 0.3) {
    throw new Error('metrics service unavailable')
  }
  return { activeUsers: 1287, revenue: '$12,431' }
}
