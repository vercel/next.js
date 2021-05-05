const { join } = require('path')
const { app, BrowserWindow } = require('electron')
const url = require('url')

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
    },
  })
  mainWindow.loadURL(
    url.format({
      pathname: join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true,
    })
  )
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
