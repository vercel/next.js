import { DB, Tigris } from '@tigrisdata/core'

const DB_NAME = 'todoStarterApp'

declare global {
  // eslint-disable-next-line no-var
  var tigrisDb: DB
}

let tigrisDb: DB

// Caching the client because `next dev` would otherwise create a
// new connection on every file save while previous connection is active due to
// hot reloading. However, in production, Next.js would completely tear down before
// restarting, thus, disconnecting and reconnecting to Tigris.
if (process.env.NODE_ENV !== 'production') {
  if (!global.tigrisDb) {
    const tigrisClient = new Tigris()
    global.tigrisDb = tigrisClient.getDatabase(DB_NAME)
  }
  tigrisDb = global.tigrisDb
} else {
  const tigrisClient = new Tigris()
  tigrisDb = tigrisClient.getDatabase(DB_NAME)
}

// export to share DB across modules
export default tigrisDb
