import { MongoClient } from 'mongodb'

console.log(process.env.MONGODB_URI)
let uri = process.env.MONGODB_URI
let cachedDb = null

export async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb
  }

  const client = await MongoClient.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  const db = await client.db(process.env.MONGODB_DB)

  cachedDb = db
  return db
}
