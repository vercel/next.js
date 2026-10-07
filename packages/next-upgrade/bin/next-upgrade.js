#!/usr/bin/env node
require('../dist/index.js')
  .runCli(process.argv)
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
