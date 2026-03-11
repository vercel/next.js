const bcrypt = require('bcrypt')

// bcrypt.genSaltSync(10)
const salt = '$2b$10$V/DVgHU.feqOSsssV5gHY.'

bcrypt.hash('pass', salt).then(function (hash) {
  console.log(hash)
})
