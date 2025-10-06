const { tmpdir } = require('os')
const { join } = require('path')

const Database = require('better-sqlite3')

const database = new Database(join(tmpdir(), 'db'), {
  fileMustExist: false,
})

console.log(database.name)
