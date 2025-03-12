import express from 'express'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'out')

const app = express()

// Redirect /redirect-to-target-page/* to /target-page/*
app.get('/redirect-to-target-page/:file?', (req, res) => {
  const { file } = req.params
  const newUrl = file ? `/target-page/${file}` : '/target-page'
  console.log(`Redirecting to ${newUrl}`)
  res.redirect(302, newUrl)
})

// Rewrite /rewrite-to-target-page/* to /target-page/*
// NOTE: This intentionally uses `app.use` instead of `app.get` because
// the latter doesn't let you modify the `req.url` property.
app.use((req, res, next) => {
  const url = req.originalUrl
  if (/^\/rewrite-to-target-page\/?[^/]*$/.test(url)) {
    const newUrl = req.originalUrl.replace(
      '/rewrite-to-target-page',
      '/target-page'
    )
    console.log(`Rewriting to ${newUrl}`)
    req.url = newUrl
  }
  next()
})

// Serve static files from the out directory
app.use(express.static(OUT_DIR, { extensions: ['html'] }))

export const server = createServer(app)
