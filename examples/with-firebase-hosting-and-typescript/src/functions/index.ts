import * as functions from 'firebase-functions'
import next from 'next'

const dev = process.env.NODE_ENV !== 'production'
const dir = __dirname
const app = next({ dev, dir, conf: { distDir: 'next' } })
const handle = app.getRequestHandler()

export const nextApp = functions.https.onRequest((req, res) => {
  console.log('File: ' + req.originalUrl)
  return app.prepare().then(() => handle(req, res))
})
