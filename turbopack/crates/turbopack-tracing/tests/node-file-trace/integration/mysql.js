const mysql = require('mysql')

var connection = mysql.createConnection({
  host: 'localhost',
  user: 'me',
  password: 'secret',
  database: 'my_db',
})
