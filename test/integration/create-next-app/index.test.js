/* eslint-env jest */
import path from 'path'
import fs from 'fs-extra'
import execa from 'execa'
import os from 'os'

const cli = require.resolve('create-next-app/dist/index.js')

jest.setTimeout(1000 * 60 * 2)

const run = (cwd, ...args) => execa('node', [cli, ...args], { cwd })
const runStarter = (cwd, ...args) => {
  const res = run(cwd, ...args)

  res.stdout.on('data', (data) => {
    const stdout = data.toString()

    if (/Pick a template/.test(stdout)) {
      res.stdin.write('\n')
    }
  })

  return res
}

async function usingTempDir(fn) {
  const folder = path.join(os.tmpdir(), Math.random().toString(36).substring(2))
  await fs.mkdirp(folder)
  try {
    return await fn(folder)
  } finally {
    await fs.remove(folder)
  }
}

describe('create next app', () => {
  it('non-empty directory', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'non-empty-directory'
      await fs.mkdirp(path.join(cwd, projectName))
      const pkg = path.join(cwd, projectName, 'package.json')
      fs.writeFileSync(pkg, '{ "foo": "bar" }')

      expect.assertions(1)
      try {
        await runStarter(cwd, projectName)
      } catch (e) {
        expect(e.stdout).toMatch(/contains files that could conflict/)
      }
    })
  })

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows
  if (process.platform !== 'win32') {
    it('empty directory', async () => {
      await usingTempDir(async (cwd) => {
        const projectName = 'empty-directory'
        const res = await runStarter(cwd, projectName)

        expect(res.exitCode).toBe(0)
        expect(
          fs.existsSync(path.join(cwd, projectName, 'package.json'))
        ).toBeTruthy()
        expect(
          fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
        ).toBeTruthy()
      })
    })
  }

  it('invalid example name', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'invalid-example-name'
      expect.assertions(2)
      try {
        await run(cwd, projectName, '--example', 'not a real example')
      } catch (e) {
        expect(e.stderr).toMatch(/Could not locate an example named/i)
      }
      expect(
        fs.existsSync(path.join(cwd, projectName, 'package.json'))
      ).toBeFalsy()
    })
  })

  it('valid example', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'valid-example'
      const res = await run(cwd, projectName, '--example', 'basic-css')
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
  })

  it('should allow example with GitHub URL', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'github-app'
      const res = await run(
        cwd,
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
  })

  it('should allow example with GitHub URL and example-path', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'github-example-path'
      const res = await run(
        cwd,
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
  })

  it('should use --example-path over the file path in the GitHub URL', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'github-example-path-2'
      const res = await run(
        cwd,
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
  })

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows
  if (process.platform !== 'win32') {
    it('should allow to manually select an example', async () => {
      await usingTempDir(async (cwd) => {
        const runExample = (...args) => {
          const res = run(cwd, ...args)

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
  }
})
