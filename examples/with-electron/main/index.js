const { app } = require('electron')

const setMenu = require('./set-menu')
const setIpc = require('./set-ipc')
const createWindow = require('./create-window.js')

global.win = null

app.on('ready', async () => {
  try {
    setMenu()
    setIpc()
    await createWindow()
  } catch (error) {
    console.error(error)
    app.exit(error)
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', async () => {
  if (global.win === null) {
    try {
      await createWindow()
    } catch (error) {
      console.error(error)
      app.exit(error)
    }
  }
})
