#!/usr/bin/env node
import { resolve, join } from 'path'
import arg from 'arg'
import { existsSync } from 'fs'
import startServer from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'

const args = arg({
  // Types
  '--help': Boolean,
  '--port': Number,
  '--hostname': String,

  // Aliases
  '-h': '--help',
  '-p': '--port',
  '-H': '--hostname'
})

if (args['--help']) {
  console.log(`
    Description
      Starts the application in development mode (hot-code reloading, error
      reporting, etc)

    Usage
      $ next dev <dir> -p <port number>

    <dir> represents where the compiled folder should go.
    If no directory is provided, the folder will be created in the current directory.
    You can set a custom folder in config https://github.com/zeit/next.js#custom-configuration.

    Options
      --port, -p      A port number on which to start the application
      --hostname, -H  Hostname on which to start the application
      --help, -h      Displays this message
  `)
  process.exit(0)
}

const dir = resolve(args._[0] || '.')

// Check if pages dir exists and warn if not
if (!existsSync(dir)) {
  printAndExit(`> No such directory exists as the project root: ${dir}`)
}

if (!existsSync(join(dir, 'pages'))) {
  if (existsSync(join(dir, '..', 'pages'))) {
    printAndExit('> No `pages` directory found. Did you mean to run `next` in the parent (`../`) directory?')
  }

  printAndExit('> Couldn\'t find a `pages` directory. Please create one under the project root')
}

const port = args['--port'] || 3000
startServer({dir, dev: true}, port, args['--hostname'])
  .then(async (app) => {
    console.log(`> Ready on http://${args['--hostname'] || 'localhost'}:${port}`)
    await app.prepare()
  })
  .catch((err) => {
    if (err.code === 'EADDRINUSE') {
      let errorMessage = `Port ${port} is already in use.`
      const pkgAppPath = require('find-up').sync('package.json', {
        cwd: dir
      })
      const appPackage = require(pkgAppPath)
      if (appPackage.scripts) {
        const nextScript = Object.entries(appPackage.scripts).find(scriptLine => scriptLine[1] === 'next')
        if (nextScript) {
          errorMessage += `\nUse \`npm run ${nextScript[0]} -- -p <some other port>\`.`
        }
      }

      console.error(errorMessage)
    } else {
      console.error(err)
    }
    process.nextTick(() => process.exit(1))
  })
