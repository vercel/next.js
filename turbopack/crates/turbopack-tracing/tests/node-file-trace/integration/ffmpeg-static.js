const { execFile } = require('child_process')
const ffmpeg = require('ffmpeg-static')

execFile(ffmpeg, ['-version'], (error, _stdout, stderr) => {
  if (error || stderr) {
    console.error('Error executing ffmpeg:', error || stderr)
    process.exit(1)
  }
})
