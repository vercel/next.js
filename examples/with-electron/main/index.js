const { app, BrowserWindow, ipcMain } = require('electron')
const { resolve } = require('app-root-path')
const dev = require('electron-is-dev')

const server = require('./server')

let win

async function createWindow () {
  // when starting the window run the server
  // this only run in development, in production it resolve automatically
  await server()

  // after the server starts create the electron browser window
  win = new BrowserWindow({
    height: 768,
    width: 1024
  })

  // open our server URL or index.html file in production from our build directory
  win.loadURL(dev ? 'http://localhost:8000' : `file://${resolve('./build')}/index.html`)

  // in development open devtools
  if (dev) {
    win.webContents.openDevTools()
  }

  win.on('close', () => {
    win = null
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (win === null) {
    createWindow()
  }
})

// listen the channel `message` and resend the received message to the renderer process
ipcMain.on('message', (event, message) => {
  event.sender.send('message', message)
})
