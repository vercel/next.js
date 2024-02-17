import { MongoClient } from "mongodb";

let mongodb: MongoClient;

declare global {
  var __db: MongoClient | undefined;
}

if (process.env.NODE_ENV === "production") {
  mongodb = new MongoClient(String(process.env.MONGO_URL));
} else {
  if (!global.__db) {
    global.__db = new MongoClient(String(process.env.MONGO_URL));
    
  }
  mongodb = global.__db;
}


export { mongodb };
