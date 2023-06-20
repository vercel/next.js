export async function fetcher(...args) {
  return await anotherFetcher(...args)
}

async function anotherFetcher(...args) {
  return await fetch(...args)
}
