import express from 'express'
import createNextApp from 'next'
import { join } from 'path'

const PORT = parseInt(process.env.PORT, 10) || 3000
const nextApp = createNextApp({ dev: process.env.NODE_ENV !== 'production', dir: join(__dirname, 'app') })
const nextRequestHandler = nextApp.getRequestHandler()

async function setupServer () {
  try {
    await nextApp.prepare()

    const app = express()

    app.get('/profile/:name', (request, response) =>
      nextApp.render(request, response, '/profile', { name: request.params.name })
    )
    app.get('*', nextRequestHandler)

    app.listen(PORT, error => {
      if (error) {
        throw error
      }
      console.log(`Ready on http://localhost:${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server', error)
  }
}

setupServer()
