/* eslint-env jest */
import mkdirpModule from 'mkdirp'
import path from 'path'
import fs from 'fs'
import execa from 'execa'
import os from 'os'
import { promisify } from 'util'

const mkdirp = promisify(mkdirpModule)

const cli = require.resolve('create-next-app/cli.js')
const cwd = path.join(
  os.tmpdir(),
  Math.random()
    .toString(36)
    .substring(2)
)

const run = (...args) => execa('node', [cli, ...args], { cwd })

describe('create next app', () => {
  beforeAll(async () => {
    jest.setTimeout(1000 * 30)
    await mkdirp(cwd)
  })

  it('non-empty directory', async () => {
    const projectName = 'non-empty-directory'

    await mkdirp(path.join(cwd, projectName))
    const pkg = path.join(cwd, projectName, 'package.json')
    fs.writeFileSync(pkg, '{ "foo": "bar" }')

    expect.assertions(1)
    try {
      await run(projectName)
    } catch (e) {
      expect(e.stdout).toMatch(/there's already a directory called/)
    }
  })

  it('empty directory', async () => {
    const projectName = 'empty-directory'
    const res = await run(projectName)

    expect(res.exitCode).toBe(0)
    expect(
      fs.existsSync(path.join(cwd, projectName, 'package.json'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
    ).toBeTruthy()
  })

  it('invalid example name', async () => {
    const projectName = 'invalid-example-name'
    const res = await run(projectName, '--example', 'not a real example')
    // TODO: the exit code should be non-zero also
    expect(res.stderr.match(/error downloading/i)).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'package.json'))
    ).toBeFalsy()
  })

  it('valid example', async () => {
    const projectName = 'valid-example'
    const res = await run(projectName, '--example', 'basic-css')
    expect(res.exitCode).toBe(0)

    expect(
      fs.existsSync(path.join(cwd, projectName, 'package.json'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
    ).toBeTruthy()
  })
})
