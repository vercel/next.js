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

describe('create next app', () => {
  beforeAll(async () => {
    jest.setTimeout(1000 * 60)
    await fs.mkdirp(cwd)
  })

  it('non-empty directory', async () => {
    const projectName = 'non-empty-directory'

    await fs.mkdirp(path.join(cwd, projectName))
    const pkg = path.join(cwd, projectName, 'package.json')
    fs.writeFileSync(pkg, '{ "foo": "bar" }')

    expect.assertions(1)
    try {
      await run(projectName)
    } catch (e) {
      expect(e.stdout).toMatch(/contains files that could conflict/)
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

  it('Should ask for a template', async () => {
    const question = async (...args) => {
      return new Promise((resolve, reject) => {
        const res = run(...args)

        let timeout = setTimeout(() => {
          if (!res.killed) {
            res.kill()
            reject(new Error('Missing request to select template'))
          }
        }, 2000)

        res.stdout.on('data', data => {
          const stdout = data.toString()

          if (/Pick a template/.test(stdout)) {
            res.kill()
            clearTimeout(timeout)
            resolve(stdout)
          }
        })
      })
    }

    const stdout = await question('no-example')

    expect(stdout).toMatch(/Default starter app/)
    expect(stdout).toMatch(/Example from the Next.js repo/)
  })
})
