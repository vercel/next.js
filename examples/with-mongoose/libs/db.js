import mongoose, { STATES } from 'mongoose'

/**
 * Connect to MongoDB.
 * Connection URI is set with environment variable `MONGODB_URL`.
 *
 * @export
 * @returns Promise<typeof mongoose>
 */
export function connect() {
  const isConnected = mongoose.connection.readyState === STATES.connected

  if (isConnected) return

  return mongoose.connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
    // Buffering means mongoose will queue up operations if it gets
    // disconnected from MongoDB and send them when it reconnects.
    // With serverless, better to fail fast if not connected.
    bufferCommands: false, // Disable mongoose buffering
    bufferMaxEntries: 0, // and MongoDB driver buffering
  })
}

/**
 * Disconnect from MongoDB.
 *
 * @export
 * @returns Promise<void>
 */
export function disconnect() {
  const isDisconnected = mongoose.connection.readyState === STATES.disconnected

  if (isDisconnected) return

  return mongoose.connection.close()
}
