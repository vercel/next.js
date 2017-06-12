const { BrowserWindow } = require('electron')
const { resolve } = require('app-root-path')
const dev = require('electron-is-dev')

const startServer = require('./start-server')
const registerFileProtocol = require('./register-file-protocol')

async function createWindow () {
  let server

  // when starting the window run the server
  // this only run in development
  if (dev) {
    server = await startServer()
  }

  // register next:// file protocol used in production
  await registerFileProtocol()

  // after the server starts create the electron browser window
  global.win = new BrowserWindow({
    height: 768,
    width: 1024
  })

  // open our server URL or index.html file in production from our build directory
  global.win.loadURL(dev ? 'http://localhost:8000' : `file://${resolve('./build')}/index.html`)

  // in development open devtools
  if (dev) {
    global.win.webContents.openDevTools()
  }

  global.win.on('close', () => {
    global.win = null
    if (server) server.close()
  })
}

module.exports = createWindow
