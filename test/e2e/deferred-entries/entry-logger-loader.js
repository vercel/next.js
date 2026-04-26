const fs = require('fs')
const path = require('path')

// A simple webpack loader that logs when an entry is being processed
module.exports = function entryLoggerLoader(source) {
  const callback = this.async()
  const resourcePath = this.resourcePath
  const logFile = path.join(__dirname, '.entry-log')

  console.log('loader', resourcePath)

  // Extract the page name from the resource path
  let pageName = resourcePath
  if (resourcePath.includes('/app/')) {
    pageName = resourcePath.split('/app/')[1] || resourcePath
  } else if (resourcePath.includes('/pages/')) {
    pageName = resourcePath.split('/pages/')[1] || resourcePath
  }

  // Log the entry processing with timestamp
  const logEntry = `${Date.now()}:${pageName}\n`

  fs.appendFile(logFile, logEntry, (err) => {
    if (err) {
      console.error('Failed to write entry log:', err)
    }
    callback(null, source)
  })
}
