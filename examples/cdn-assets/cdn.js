const express = require('express')
const path = require('path')

const NEXT_DIR = path.join(__dirname, '.next')

const app = express()
app.use('/_next/-', express.static(NEXT_DIR))

app.listen(9999, err => {
  if (err) {
    throw err
  }

  console.log('> CDN listening at http://localhost:9999/_next')
})
