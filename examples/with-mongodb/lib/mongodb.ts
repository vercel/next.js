import { MongoClient, Db } from 'mongodb';


const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB;

if (!MONGODB_URI) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
}

if (!MONGODB_DB) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_DB"');
}


const options = {};


let db:Db;

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _db?: Db;
  };

  if (!globalWithMongo._db) {
    const client = new MongoClient(MONGODB_URI, options);
    //  (client.connect() is optional starting v4.7)
    globalWithMongo._db = client.db(MONGODB_DB);
  }
  
  db = globalWithMongo._db;
  
} else {
  // In production mode, it's best to not use a global variable.
  const client = new MongoClient(MONGODB_URI, options);
  //  (client.connect() is optional starting v4.7)
  db = client.db(MONGODB_DB);
}

export default db;