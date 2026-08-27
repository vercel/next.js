export async function getData(client) {
  'use cache: remote'

  console.log(client)

  return Math.random()
}
