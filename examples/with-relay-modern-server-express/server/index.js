const express = require('express')
const graphqlHTTP = require('express-graphql')
const next = require('next')
const path = require('path')
const fs = require('fs')
const { buildSchema } = require('graphql')
const rootValue = require('./rootValue')
const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const schemaPath = path.join(__dirname, '/schema.graphql')
const schemaContent = fs.readFileSync(schemaPath).toString()
const graphqlSchema = buildSchema(schemaContent)

app.prepare().then(() => {
  const server = express()

  server.use(
    '/graphql',
    graphqlHTTP({
      schema: graphqlSchema,
      graphiql: false,
      rootValue: rootValue
    })
  )

  server.get('*', (req, res) => {
    return handle(req, res)
  })

  server.listen(port, err => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
