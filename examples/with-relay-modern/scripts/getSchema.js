var fetch = require('node-fetch')
var fs = require('fs')
var path = require('path')

require('dotenv').config()

const {
  buildClientSchema,
    introspectionQuery,
    printSchema
} = require('graphql/utilities')

console.log(introspectionQuery)

fetch(process.env.RELAY_ENDPOINT, {
  method: 'POST',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ 'query': introspectionQuery })
})
    .then(res => res.json())
    .then(res => {
      console.log(res)
      const schemaString = printSchema(buildClientSchema(res.data))
      fs.writeFileSync(path.join(__dirname, '..', 'schema', 'schema.graphql'), schemaString)
    })
