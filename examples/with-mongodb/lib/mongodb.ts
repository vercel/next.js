import { MongoClient, Db } from 'mongodb';


const uri = process.env.MONGODB_URI;

if (!uri) {
  throw new Error('Invalid/Missing environment variable: "MONGODB_URI"');
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
    const client = new MongoClient(uri, options);
    //  (client.connect() is optional starting v4.7)
    globalWithMongo._db = client.db();
  }
  
  db = globalWithMongo._db;
  
} else {
  // In production mode, it's best to not use a global variable.
  const client = new MongoClient(uri, options);
  //  (client.connect() is optional starting v4.7)
  db = client.db();
}

export default db;