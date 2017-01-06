'use strict'
const nextJS = require('next')
const path = require('path')
const favicon = require('serve-favicon')
const compress = require('compression')
const cors = require('cors')
const feathers = require('feathers')
const configuration = require('feathers-configuration')
const hooks = require('feathers-hooks')
const rest = require('feathers-rest')
const bodyParser = require('body-parser')
const socketio = require('feathers-socketio')
const middleware = require('./middleware')
const services = require('./services')
const routes = require('./routes') // <= import routes

const app = nextJS({ dev: true, dir: process.cwd() })
const server = feathers()
const port = process.env.$PORT ? process.env.$PORT : 3100

app.prepare()
  .then(function () {
    server.configure(configuration(path.join(__dirname, '..')))
    server.set('next', app)
    server.use(compress())
      .options('*', cors())
      .use(cors())
      .use(favicon(path.join(server.get('public'), 'favicon.ico')))
      .use(bodyParser.urlencoded({ extended: true }))
      .use(bodyParser.json())
      .configure(hooks())
      .configure(rest())
      .configure(socketio())
      .configure(services)
      .configure(routes) // <= add the route to feathers'
      .configure(middleware)

    const process = server.listen(port)

    process.on('listening', () =>
      console.log(`Feathers Next started on ${server.get('host')}:${port}`)
    )
  })

