import { execFileSync } from 'child_process'
import path from 'path'

const repoDir = path.join(__dirname, '../..')

function withoutBuiltNext(script: string) {
  return execFileSync(
    process.execPath,
    [
      '-e',
      `
        const assert = require('assert')
        const Module = require('module')
        const load = Module._load
        Module._load = function(request, ...args) {
          if (request.startsWith('next/dist/')) {
            const error = new Error('Built Next output is unavailable: ' + request)
            error.code = 'MODULE_NOT_FOUND'
            throw error
          }
          return load.call(this, request, ...args)
        }
        ;(async () => { ${script} })().catch((error) => {
          console.error(error)
          process.exitCode = 1
        })
      `,
    ],
    { cwd: repoDir, encoding: 'utf8' }
  )
}

describe('create-next-install bootstrap', () => {
  it('can import the installation harness before Next is built', () => {
    withoutBuiltNext(`
      const harness = require('./test/lib/create-next-install')
      assert.equal(typeof harness.createNextInstall, 'function')
      assert.equal(typeof harness.packPackages, 'function')
    `)
  })

  it('can load the test runner CLI before Next is built', () => {
    expect(
      withoutBuiltNext(`
        process.argv = [process.execPath, 'run-tests.js', '--help']
        require('./run-tests.js')
      `)
    ).toContain('--require-timings')
  })
})
