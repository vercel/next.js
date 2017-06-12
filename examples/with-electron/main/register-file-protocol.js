const { join } = require('path')
const { dialog, protocol } = require('electron')

const handleSuccess = (request, callback) => {
  // request.url contains a full URL, so we remove the `next:///` prefix
  const localPath = request.url.substr(8)
  callback({ path: join(__dirname, '../build', localPath) })
}

const handleError = error => {
  if (error) return dialog.showErrorBox(error.message, error.stack)
}

module.exports = async () => {
  return protocol.registerFileProtocol('next', handleSuccess, handleError)
}
