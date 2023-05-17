import { Db } from 'mongodb'

declare global {
  var _db: Db
}
