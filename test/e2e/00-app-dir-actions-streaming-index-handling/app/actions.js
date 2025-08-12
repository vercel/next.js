'use server'

export async function increment(value) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  return value + 1
}
