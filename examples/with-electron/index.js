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
    // for security reasons we only allow GET requests
    const server = createServer((req, res) => {
      // if the request is not from an Electron app
      // we response with a 404 status code
      if (req.headers['user-agent'].indexOf('Electron') === -1) {
        res.writeHead(404)
        res.end()
        return
      }

      res.setHeader('Access-Control-Request-Method', 'GET')

      if (req.method !== 'GET') {
        res.writeHead(405)
        res.end('Method Not Allowed')
        return
      }

      return handler(req, res)
    })

    // the port should be random to avoid problems if
    // it's already in use
    server.listen(3000, (error) => {
      if (error) throw error

      // after the server starts create the electron browser window
      win = new BrowserWindow({
        height: 768,
        width: 1024,
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
