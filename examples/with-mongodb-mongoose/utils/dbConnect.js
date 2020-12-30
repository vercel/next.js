/* This is a database connection function*/
import mongoose from 'mongoose'

async function dbConnect() {
  /* check if we have connection to our database or database is currently connecting or disconnecting (readyState 1, 2 and 3) */
  if (mongoose.connection.readyState >= 1) {
    return;
  }

  /* connecting to our database */
  const db = await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  })
}

export default dbConnect
