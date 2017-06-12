const { ipcMain } = require('electron')

module.exports = () => {
  // listen the channel `message` and resend the received message to the renderer process
  ipcMain.on('message', (event, message) => {
    event.sender.send('message', message)
  })
}
