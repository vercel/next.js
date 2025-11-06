const { spawn } = require('node:child_process')
const { join } = require('node:path')

const child = spawn('gifsicle', [
  '--colors',
  '256',
  join(__dirname, './asset1.txt'),
])
