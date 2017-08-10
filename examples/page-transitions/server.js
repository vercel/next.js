const next = require('next')
const routes = require('./routes')
const express = require('express')
const compression = require('compression')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'

const app = next({ dev })
const handle = routes.getRequestHandler(app)

app.prepare().then(express().use(compression()).use(handle).listen(port))
