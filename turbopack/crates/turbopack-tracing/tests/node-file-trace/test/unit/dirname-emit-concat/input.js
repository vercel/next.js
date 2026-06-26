const fs = require('fs')
fs.promises.readdir(__dirname + '/assets').then((files) => {
  console.log(files)
})
