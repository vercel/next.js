/* eslint-env jest */
import { join } from 'path'
import { execSync } from 'child_process'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
  renderViaHTTP,
} from 'next-test-utils'

let app
let appPort
const projectAAppDir = join(__dirname, '../project-a')
const projectBAppDir = join(__dirname, '../project-b')

const runTests = (project) => {
  it('should resolve index page correctly', async () => {
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toContain(project)
    expect(html).toContain(`Hello, World!`)
  })
}

const runRelayCompiler = () => {
  // Relay expects the current directory to contain a relay.json
  // This ensures the CWD is the one with relay.json since running
  // the relay-compiler through yarn would make the root of the repo the CWD.
  execSync('../../../node_modules/relay-compiler/cli.js', {
    cwd: './test/integration/relay-graphql-swc-multi-project',
  })
}

// TODO: Support for Turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Relay Compiler Transform - Multi Project Config',
  () => {
    beforeAll(() => {
      runRelayCompiler()
    })

    describe('dev mode', () => {
      describe('project-a', () => {
        beforeAll(async () => {
          appPort = await findPort()
          app = await launchApp(projectAAppDir, appPort, {
            cwd: projectAAppDir,
          })
        })

        afterAll(() => killApp(app))

        runTests('Project A')
      })

      describe('project-b', () => {
        beforeAll(async () => {
          appPort = await findPort()
          app = await launchApp(projectBAppDir, appPort, {
            cwd: projectBAppDir,
          })
        })

        afterAll(() => killApp(app))

        runTests('Project B')
      })
    })
    ;(process.env.TURBOPACK ? describe.skip : describe)(
      'production mode',
      () => {
        describe('project-a', () => {
          beforeAll(async () => {
            await nextBuild(projectAAppDir, [], { cwd: projectAAppDir })
            appPort = await findPort()
            app = await nextStart(projectAAppDir, appPort)
          })

          afterAll(() => killApp(app))

          runTests('Project A')
        })

        describe('project-b', () => {
          beforeAll(async () => {
            await nextBuild(projectBAppDir, [], { cwd: projectBAppDir })
            appPort = await findPort()
            app = await nextStart(projectBAppDir, appPort)
          })

          afterAll(() => killApp(app))

          runTests('Project B')
        })
      }
    )
  }
)
