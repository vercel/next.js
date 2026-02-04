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

require('http')
  .createServer((req, res) => {
    console.time('next-request')
    return requestHandler(req, res).finally(() => {
      console.timeEnd('next-request')
    })
  })
  .listen(3000, () => {
    console.timeEnd('next-cold-start')
  })
