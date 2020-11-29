/* This is a database connection function*/
import mongoose from 'mongoose'

async function dbConnect() {
  /* check if we have connection to our databse or databse is curentlly connecting or disconnecting (readyState 1,2 and 3)*/
  if (mongoose.connection.readyState >= 1) {
    /* then do nothing */
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
