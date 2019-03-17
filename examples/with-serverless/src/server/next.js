import next from 'next'
import app from '../app/app'
import routes from '../routes/routes'

const PORT = process.env.PORT || 8000

const nextApp = next({
  dev: process.env.STAGE === 'local'
})

const requestHandler = nextApp.getRequestHandler()

routes.forEach((route) => {
  app.get(route.path, (req, res) => nextApp.render(req, res, route.page, { title: req.params.id }))
})

app.get('*', (req, res) => requestHandler(req, res))

nextApp.prepare().then(() => {
  app.listen(PORT, (err) => {
    if (err) throw err
    console.log(`Project is running as ${process.env.STAGE} on port ${PORT}`)
  })
})
