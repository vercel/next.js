/* eslint-env jest */
/* global jasmine */
import { join } from 'path'
import {
  killApp,
  findPort,
  runNextCommand,
  renderViaHTTP
} from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 30

const appDir = join(__dirname, '../')
let appPort
let app

describe('Production Usage', () => {
  beforeAll(async () => {
    await runNextCommand(['build', appDir])
  })

  it('should render a page with context', async () => {
    appPort = await findPort()

    await new Promise((resolve, reject) => {
      runNextCommand(['start', appDir, '-p', appPort], {
        instance: (child) => {
          app = child
          child.stdout.on('data', chunk => {
            if (chunk.toString().match(/ready on/i)) resolve()
          })
          child.stderr.on('data',
            chunk => reject(new Error('got error ' + chunk.toString()))
          )
        }
      }).catch(err => reject(err))
    })

    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Value: .*?hello world/)
    await killApp(app)
  })
})
