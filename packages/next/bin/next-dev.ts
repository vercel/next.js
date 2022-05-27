#!/usr/bin/env node
import * as Log from '../build/output/log'
import { startedDevelopmentServer } from '../build/output'
import { startServer } from '../server/lib/start-server'

const [, , allowRetry, dir, port, host] = process.argv

process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

async function preflight() {
  const { getPackageVersion } = await Promise.resolve(
    require('../lib/get-package-version')
  )
  const [sassVersion, nodeSassVersion] = await Promise.all([
    getPackageVersion({ cwd: dir, name: 'sass' }),
    getPackageVersion({ cwd: dir, name: 'node-sass' }),
  ])
  if (sassVersion && nodeSassVersion) {
    Log.warn(
      'Your project has both `sass` and `node-sass` installed as dependencies, but should only use one or the other. ' +
        'Please remove the `node-sass` dependency from your project. ' +
        ' Read more: https://nextjs.org/docs/messages/duplicate-sass'
    )
  }
}

startServer({
  allowRetry: allowRetry === '1',
  dev: true,
  dir,
  hostname: host,
  isNextDevCommand: true,
  port: Number(port),
})
  .then(async (app) => {
    const appUrl = `http://${app.hostname}:${app.port}`
    startedDevelopmentServer(appUrl, `${host}:${app.port}`)
    // Start preflight after server is listening and ignore errors:
    preflight().catch(() => {})
    // Finalize server bootup:
    await app.prepare()
  })
  .catch((err) => {
    if (err.code === 'EADDRINUSE') {
      let errorMessage = `Port ${port} is already in use.`
      const pkgAppPath = require('next/dist/compiled/find-up').sync(
        'package.json',
        {
          cwd: dir,
        }
      )
      const appPackage = require(pkgAppPath)
      if (appPackage.scripts) {
        const nextScript = Object.entries(appPackage.scripts).find(
          (scriptLine) => scriptLine[1] === 'next'
        )
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
