const { spawn } = require('child_process')
const { join } = require('path')

const child = spawn('gifsicle', [
  '--colors',
  '256',
  join(__dirname, './asset1.txt'),
])
