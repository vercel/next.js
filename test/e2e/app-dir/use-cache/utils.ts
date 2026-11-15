export async function tasky() {
  // make cache-misses noticeable
  await new Promise((resolve) => setTimeout(resolve))
}
