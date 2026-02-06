#!/usr/bin/env node
process.env.NODE_ENV = 'production'

require('../../../test/lib/react-channel-require-hook')

console.time('next-cold-start')
const NextServer = require('next/dist/server/next-server').default
const path = require('path')

const appDir = process.cwd()
const distDir = '.next'

const compiledConfig = require(
  path.join(appDir, distDir, 'required-server-files.json')
).config

process.chdir(appDir)

const nextServer = new NextServer({
  conf: compiledConfig,
  dir: appDir,
  distDir,
  minimalMode: true,
  customServer: false,
})

const requestHandler = nextServer.getRequestHandler()

const port = parseInt(process.env.PORT, 10) || 3000

require('http')
  .createServer((req, res) => {
    return requestHandler(req, res)
  })
  .listen(port, () => {
    console.timeEnd('next-cold-start')
    console.log('Listening on port ' + port)
  })
