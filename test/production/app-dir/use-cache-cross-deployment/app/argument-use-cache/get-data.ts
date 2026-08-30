export async function getData(action) {
  'use cache: remote'

  console.log(action)

  return Math.random()
}
