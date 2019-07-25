/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import { readFileSync, readdirSync } from 'fs'
import rimraf from 'rimraf'
import { promisify } from 'util'
import { nextServer, runNextCommand, startApp, stopApp } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

const rimrafPromise = promisify(rimraf)
let appDir = join(__dirname, '..')
let buildDir = join(__dirname, '../build')
let server
// let appPort

describe('Modern Mode', () => {
  beforeAll(async () => {
    await runNextCommand(['build'], {
      cwd: appDir,
      stdout: true,
      stderr: true
    })

    const app = nextServer({
      dir: buildDir,
      dev: false,
      quiet: true,
      experimental: {
        modern: true
      }
    })

    server = await startApp(app)
    // appPort = server.address().port
  })
  afterAll(async () => {
    stopApp(server)
    rimrafPromise(join(buildDir, '.next'))
  })
  it('should generate client side modern and legacy build files', async () => {
    const buildId = readFileSync(join(buildDir, '.next/BUILD_ID'), 'utf8')

    const expectedFiles = [
      'index',
      '_app',
      '_error',
      'main',
      'webpack',
      'commons'
    ]
    const buildFiles = [
      ...readdirSync(join(buildDir, '.next/static', buildId, 'pages')),
      ...readdirSync(join(buildDir, '.next/static/runtime')).map(
        file => file.replace(/-\w+\./, '.') // remove hash
      ),
      ...readdirSync(join(buildDir, '.next/static/chunks')).map(
        file => file.replace(/\.\w+\./, '.') // remove hash
      )
    ]

    console.log(`Client files: ${buildFiles.join(', ')}`)

    expectedFiles.forEach(file => {
      expect(buildFiles).toContain(`${file}.js`)
      expect(buildFiles).toContain(`${file}.module.js`)
    })
  })
})
