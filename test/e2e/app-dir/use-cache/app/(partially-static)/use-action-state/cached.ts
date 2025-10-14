'use cache: remote'

export async function getRandomValue() {
  const v = Math.random()
  console.log(v)
  return v
}
