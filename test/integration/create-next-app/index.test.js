/* global fixture, test */
import 'testcafe'
import mkdirpModule from 'mkdirp'
import path from 'path'
import fs from 'fs'
import execa from 'execa'
import os from 'os'
import { promisify } from 'util'

const mkdirp = promisify(mkdirpModule)

const cli = require.resolve('create-next-app/dist/index.js')
const cwd = path.join(
  os.tmpdir(),
  Math.random()
    .toString(36)
    .substring(2)
)

const run = (...args) => execa('node', [cli, ...args], { cwd })

fixture('create next app').before(async () => {
  await mkdirp(cwd)
})

test('non-empty directory', async t => {
  const projectName = 'non-empty-directory'

  await mkdirp(path.join(cwd, projectName))
  const pkg = path.join(cwd, projectName, 'package.json')
  fs.writeFileSync(pkg, '{ "foo": "bar" }')
  let errorMsg

  try {
    await run(projectName)
  } catch (e) {
    errorMsg = e.stdout
  }
  await t.expect(errorMsg).match(/contains files that could conflict/)
})

test('empty directory', async t => {
  const projectName = 'empty-directory'
  const res = await run(projectName)

  await t.expect(res.exitCode).eql(0)
  await t
    .expect(fs.existsSync(path.join(cwd, projectName, 'package.json')))
    .ok()
  await t
    .expect(fs.existsSync(path.join(cwd, projectName, 'pages/index.js')))
    .ok()
})

test('invalid example name', async t => {
  const projectName = 'invalid-example-name'
  let errorMsg
  try {
    await run(projectName, '--example', 'not a real example')
  } catch (e) {
    errorMsg = e.stderr
  }
  await t.expect(errorMsg).match(/Could not locate an example named/i)
  await t
    .expect(fs.existsSync(path.join(cwd, projectName, 'package.json')))
    .notOk()
})

test('valid example', async t => {
  const projectName = 'valid-example'
  const res = await run(projectName, '--example', 'basic-css')
  await t.expect(res.exitCode).eql(0)

  await t
    .expect(fs.existsSync(path.join(cwd, projectName, 'package.json')))
    .ok()
  await t
    .expect(fs.existsSync(path.join(cwd, projectName, 'pages/index.js')))
    .ok()
})
