const log = (globalThis.topLevelAwaitLog ??= [])

const connectToDB = async (url) => {
  log.push(['connecting to db', url])
  await new Promise((r) => setTimeout(r, 10))
  log.push(['connected to db', url])
}

// This is a top-level-await
await connectToDB('my-sql://example.com')

export const dbCall = async (data) => {
  log.push(['dbCall', data])
  // This is a normal await, because it's in an async function
  await new Promise((r) => setTimeout(r, 10))
  return 'fake data'
}

export const close = () => {
  log.push(['closes the DB connection'])
}
