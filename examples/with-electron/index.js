const { app, BrowserWindow, ipcMain } = require('electron')
const { createServer } = require('http')
const next = require('next')

const dev = process.env.NODE_ENV !== 'production'

const nextApp = next({ dev })
const handler = nextApp.getRequestHandler()

let win

function createWindow() {
  // start building the next.js app
  nextApp
  .prepare()
  .then(() => {
    // create a server to handle every router with next
    // (usually you don't need pretty urls in electron)
    const server = createServer((req, res) => handler(req, res))
    server.listen(3000, (error) => {
      if (error) throw error

      // after the server starts create the electron browser window
      win = new BrowserWindow({
        height: 768,
        width: 1024
      })

      // open our server URL
      win.loadURL('http://localhost:3000')

      win.webContents.openDevTools()

      win.on('close', () => {
        // when the windows is closed clear the `win` variable and close the server
        win = null
        server.close()
      })
    })
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
