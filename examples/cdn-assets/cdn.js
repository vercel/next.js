const express = require('express')
const path = require('path')

const NEXT_DIR = path.join(__dirname, '.next')

const app = express()
// `-` is the default build ID. A real CDN would use a version number/etc here.
app.use('/assets/-/', express.static(NEXT_DIR))

app.listen(9999, err => {
  if (err) {
    throw err
  }

  console.log('> CDN listening at http://localhost:9999/_next')
})
