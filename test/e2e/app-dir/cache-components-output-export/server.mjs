import express from 'express'
import { createServer } from 'node:http'
import handler from 'serve-handler'

export function createExportServer(outDir, { basePath, trailingSlash }) {
  const app = express()
  app.use(basePath || '/', (request, response) =>
    handler(request, response, { public: outDir, trailingSlash })
  )
  return createServer(app)
}
