import awsServerlessExpress from 'aws-serverless-express'
import app from '../app/app'
import routes from '../routes/routes'

const binaryMimeTypes = [
  'application/javascript',
  'application/json',
  'application/octet-stream',
  'application/xml',
  'font/eot',
  'font/opentype',
  'font/otf',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'text/comma-separated-values',
  'text/css',
  'text/html',
  'text/javascript',
  'text/plain',
  'text/text',
  'text/xml'
]

export const handler = (event, context) => {
  routes.forEach((route) => {
    /* eslint-disable import/no-dynamic-require, global-require */
    app.get(route.path, (req, res) => require(`../../.next/serverless/pages${route.page}.js`).render(req, res))
    /* eslint-enable import/no-dynamic-require, global-require */
  })
  return awsServerlessExpress.proxy(
    awsServerlessExpress.createServer(app, null, binaryMimeTypes),
    event,
    context
  )
}
