const bcrypt = require('bcrypt')

// Fixed salt for deterministic outputs between Turbopack and @vercel/nft
// bcrypt.genSaltSync(10)
const salt = '$2b$10$V/DVgHU.feqOSsssV5gHY.'

bcrypt.hash('pass', salt).then(function (hash) {
  console.log(hash)
})
