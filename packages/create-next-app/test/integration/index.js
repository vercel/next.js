import test from 'ava'
import execa from 'execa'
import tempy from 'tempy'
import mkdir from 'make-dir'
import path from 'path'
import fs from 'fs'

const cli = path.resolve(__dirname, '..', '..', 'cli.js')
const cwd = tempy.directory()

const run = (...args) => execa('node', [cli, ...args], { cwd })

test('non-empty directory', async t => {
  const projectName = 'non-empty-directory'

  await mkdir(path.join(cwd, projectName))
  const pkg = path.join(cwd, projectName, 'package.json')
  fs.writeFileSync(pkg, '{ "foo": "bar" }')

  const p = run(projectName)
  await t.throws(p, /there's already a directory called/)
})

test('empty directory', async t => {
  const projectName = 'empty-directory'
  const res = await run(projectName)

  t.is(res.code, 0)
  t.true(fs.existsSync(path.join(cwd, projectName, 'package.json')))
  t.true(fs.existsSync(path.join(cwd, projectName, 'pages/index.js')))
})

test('invalid example name', async t => {
  const projectName = 'invalid-example-name'
  const res = await run(projectName, '--example', 'not a real example')
  // TODO: the exit code should be non-zero also
  t.truthy(res.stderr.match(/error downloading/i))
  t.false(fs.existsSync(path.join(cwd, projectName, 'package.json')))
})

test('valid example', async t => {
  const projectName = 'valid-example'
  const res = await run(projectName, '--example', 'basic-css')
  t.is(res.code, 0)

  t.true(fs.existsSync(path.join(cwd, projectName, 'package.json')))
  t.true(fs.existsSync(path.join(cwd, projectName, 'pages/index.js')))
})
