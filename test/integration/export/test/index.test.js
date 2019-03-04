/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  nextBuild,
  nextExport,
  startStaticServer,
  launchApp,
  stopApp,
  killApp,
  findPort,
  renderViaHTTP
} from 'next-test-utils'

import ssr from './ssr'
import browser from './browser'
import dev from './dev'
import { promisify } from 'util'
import fs from 'fs'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const writeFile = promisify(fs.writeFile)
const mkdir = promisify(fs.mkdir)
const access = promisify(fs.access)
const appDir = join(__dirname, '../')
const context = {}
const devContext = {}

describe('Static Export', () => {
  it('should delete existing exported files', async () => {
    const outdir = join(appDir, 'out')
    const tempfile = join(outdir, 'temp.txt')

    await mkdir(outdir).catch((e) => { if (e.code !== 'EEXIST') throw e })
    await writeFile(tempfile, 'Hello there')

    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    let doesNotExist = false
    await access(tempfile).catch((e) => {
      if (e.code === 'ENOENT') doesNotExist = true
    })
    expect(doesNotExist).toBe(true)
  })
  beforeAll(async () => {
    const outdir = join(appDir, 'out')
    await nextBuild(appDir)
    await nextExport(appDir, { outdir })

    context.server = await startStaticServer(join(appDir, 'out'))
    context.port = context.server.address().port

    devContext.port = await findPort()
    devContext.server = await launchApp(join(__dirname, '../'), devContext.port, true)

    // pre-build all pages at the start
    await Promise.all([
      renderViaHTTP(devContext.port, '/'),
      renderViaHTTP(devContext.port, '/dynamic/one')
    ])
  })
  afterAll(async () => {
    await Promise.all([
      stopApp(context.server),
      killApp(devContext.server)
    ])
  })

  ssr(context)
  browser(context)
  dev(devContext)
})
