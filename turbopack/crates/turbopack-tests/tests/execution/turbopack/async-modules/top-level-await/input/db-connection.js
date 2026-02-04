const connectToDB = async (url) => {
  console.log('connecting to db', url)
  await new Promise((r) => setTimeout(r, 100))
}

// This is a top-level-await
await connectToDB('my-sql://example.com')

export const dbCall = async (data) => {
  console.log('dbCall', data)
  // This is a normal await, because it's in an async function
  await new Promise((r) => setTimeout(r, 100))
  return 'fake data'
}

export const close = () => {
  console.log('closes the DB connection')
}
