/* eslint-env jest */
import execa from 'execa'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const cli = require.resolve('create-next-app/dist/index.js')

jest.setTimeout(1000 * 60 * 5)

const run = (args, options) => execa('node', [cli].concat(args), options)

async function usingTempDir(fn, options) {
  const folder = path.join(os.tmpdir(), Math.random().toString(36).substring(2))
  await fs.mkdirp(folder, options)
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

      const res = await run([projectName], { cwd, reject: false })
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toMatch(/contains files that could conflict/)
    })
  })

  // TODO: investigate why this test stalls on yarn install when
  // stdin is piped instead of inherited on windows
  if (process.platform !== 'win32') {
    it('empty directory', async () => {
      await usingTempDir(async (cwd) => {
        const projectName = 'empty-directory'
        const res = await run([projectName], { cwd })

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
      const res = await run([projectName, '--example', 'not a real example'], {
        cwd,
        reject: false,
      })

      expect(res.exitCode).toBe(1)
      expect(res.stderr).toMatch(/Could not locate an example named/i)
      expect(
        fs.existsSync(path.join(cwd, projectName, 'package.json'))
      ).toBeFalsy()
    })
  })

  it('valid example', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'valid-example'
      const res = await run([projectName, '--example', 'basic-css'], { cwd })
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
        [
          projectName,
          '--example',
          'https://github.com/zeit/next-learn-demo/tree/master/1-navigate-between-pages',
        ],
        {
          cwd,
        }
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
        [
          projectName,
          '--example',
          'https://github.com/zeit/next-learn-demo/tree/master',
          '--example-path',
          '1-navigate-between-pages',
        ],
        {
          cwd,
        }
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
        [
          projectName,
          '--example',
          'https://github.com/zeit/next-learn-demo/tree/master/1-navigate-between-pages',
          '--example-path',
          '1-navigate-between-pages',
        ],
        {
          cwd,
        }
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
    it('should fall back to default template', async () => {
      await usingTempDir(async (cwd) => {
        const projectName = 'fail-example'
        const res = await run(
          [projectName, '--example', '__internal-testing-retry'],
          {
            cwd,
            input: '\n',
          }
        )
        expect(res.exitCode).toBe(0)

        const files = ['package.json', 'pages/index.js', '.gitignore']
        files.forEach((file) =>
          expect(fs.existsSync(path.join(cwd, projectName, file))).toBeTruthy()
        )
      })
    })
  }

  it('should allow an example named default', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'default-example'
      const res = await run([projectName, '--example', 'default'], { cwd })
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

  it('should exit if example flag is empty', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'no-example-provided'
      const res = await run([projectName, '--example'], { cwd, reject: false })
      expect(res.exitCode).toBe(1)
    })
  })

  it('should exit if the folder is not writable', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'not-writable'
      const res = await run([projectName], { cwd, reject: false })

      if (process.platform === 'win32') {
        expect(res.exitCode).toBe(0)
        expect(
          fs.existsSync(path.join(cwd, projectName, 'package.json'))
        ).toBeTruthy()
        return
      }
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toMatch(
        /you do not have write permissions for this folder/
      )
    }, 0o500)
  })

  it('should create a project in the current directory', async () => {
    await usingTempDir(async (cwd) => {
      const res = await run(['.'], { cwd })
      expect(res.exitCode).toBe(0)

      const files = ['package.json', 'pages/index.js', '.gitignore']
      files.forEach((file) =>
        expect(fs.existsSync(path.join(cwd, file))).toBeTruthy()
      )
    })
  })

  it('should ask the user for a name for the project if none supplied', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'test-project'
      const res = await run([], { cwd, input: `${projectName}\n` })
      expect(res.exitCode).toBe(0)

      const files = ['package.json', 'pages/index.js', '.gitignore']
      files.forEach((file) =>
        expect(fs.existsSync(path.join(cwd, projectName, file))).toBeTruthy()
      )
    })
  })
})
