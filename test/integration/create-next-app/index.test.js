/* eslint-env jest */
import path from 'path'
import fs from 'fs-extra'
import execa from 'execa'
import os from 'os'

const cli = require.resolve('create-next-app/dist/index.js')
const cwd = path.join(
  os.tmpdir(),
  Math.random()
    .toString(36)
    .substring(2)
)

const run = (...args) => execa('node', [cli, ...args], { cwd })
const runStarter = (...args) => {
  const res = run(...args)

  res.stdout.on('data', data => {
    const stdout = data.toString()

    if (/Pick a template/.test(stdout)) {
      res.stdin.write('\n')
    }
  })

  return res
}

describe('create next app', () => {
  beforeAll(async () => {
    jest.setTimeout(1000 * 60 * 3)
    await fs.mkdirp(cwd)
  })

  it('non-empty directory', async () => {
    const projectName = 'non-empty-directory'
    await fs.mkdirp(path.join(cwd, projectName))
    const pkg = path.join(cwd, projectName, 'package.json')
    fs.writeFileSync(pkg, '{ "foo": "bar" }')

    expect.assertions(1)
    try {
      await runStarter(projectName)
    } catch (e) {
      expect(e.stdout).toMatch(/contains files that could conflict/)
    }
  })

  it('empty directory', async () => {
    const projectName = 'empty-directory'
    const res = await runStarter(projectName)

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
    expect.assertions(2)
    try {
      await run(projectName, '--example', 'not a real example')
    } catch (e) {
      expect(e.stderr).toMatch(/Could not locate an example named/i)
    }
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
    // check we copied default `.gitignore`
    expect(
      fs.existsSync(path.join(cwd, projectName, '.gitignore'))
    ).toBeTruthy()
  })

  it('should allow example with GitHub URL', async () => {
    const projectName = 'github-app'
    const res = await run(
      projectName,
      '--example',
      'https://github.com/zeit/next-learn-demo/tree/master/1-navigate-between-pages'
    )

    expect(res.exitCode).toBe(0)
    expect(
      fs.existsSync(path.join(cwd, projectName, 'package.json'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/about.js'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, '.gitignore'))
    ).toBeTruthy()
  })

  it('should allow example with GitHub URL and example-path', async () => {
    const projectName = 'github-example-path'
    const res = await run(
      projectName,
      '--example',
      'https://github.com/zeit/next-learn-demo/tree/master',
      '--example-path',
      '1-navigate-between-pages'
    )

    expect(res.exitCode).toBe(0)
    expect(
      fs.existsSync(path.join(cwd, projectName, 'package.json'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/about.js'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, '.gitignore'))
    ).toBeTruthy()
  })

  it('should use --example-path over the file path in the GitHub URL', async () => {
    const projectName = 'github-example-path-2'
    const res = await run(
      projectName,
      '--example',
      'https://github.com/zeit/next-learn-demo/tree/master/1-navigate-between-pages',
      '--example-path',
      '1-navigate-between-pages'
    )

    expect(res.exitCode).toBe(0)
    expect(
      fs.existsSync(path.join(cwd, projectName, 'package.json'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, 'pages/about.js'))
    ).toBeTruthy()
    expect(
      fs.existsSync(path.join(cwd, projectName, '.gitignore'))
    ).toBeTruthy()
  })

  it('should allow to manually select an example', async () => {
    const runExample = (...args) => {
      const res = run(...args)

      function pickExample(data) {
        if (/hello-world/.test(data.toString())) {
          res.stdout.removeListener('data', pickExample)
          res.stdin.write('\n')
        }
      }

      function searchExample(data) {
        if (/Pick an example/.test(data.toString())) {
          res.stdout.removeListener('data', searchExample)
          res.stdin.write('hello-world')
          res.stdout.on('data', pickExample)
        }
      }

      function selectExample(data) {
        if (/Pick a template/.test(data.toString())) {
          res.stdout.removeListener('data', selectExample)
          res.stdin.write('\u001b[B\n') // Down key and enter
          res.stdout.on('data', searchExample)
        }
      }

      res.stdout.on('data', selectExample)

      return res
    }

    const res = await runExample('no-example')

    expect(res.exitCode).toBe(0)
    expect(res.stdout).toMatch(/Downloading files for example hello-world/)
  })
})
