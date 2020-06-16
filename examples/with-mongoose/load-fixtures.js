#!/bin/env node
const { loadEnvConfig } = require('next/dist/lib/load-env-config')
const Fixtures = require('node-mongodb-fixtures')

loadEnvConfig(__dirname)

// The MongoDB native drive options object
const mongoOpts = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}
const fixtures = new Fixtures({
  dir: './fixtures',
  filter: '.*', // optional
})

fixtures
  .connect(process.env.MONGODB_URL, mongoOpts)
  .then(() => fixtures.load())
  .catch(console.error)
  .finally(() => fixtures.disconnect())
