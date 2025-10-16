const fs = require('fs')

const dotFiles = fs.readdirSync(__dirname, 'with-dot')

const nonDotFiles = fs.readdirSync(__dirname, 'without-dot')

console.log({
  dotFiles,
  nonDotFiles,
})
