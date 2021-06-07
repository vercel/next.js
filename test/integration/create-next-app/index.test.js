/* eslint-env jest */
import execa from 'execa'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const cli = require.resolve('create-next-app/dist/index.js')

const exampleRepo = 'https://github.com/vercel/next-learn-starter/tree/master'
const examplePath = 'navigate-between-pages-starter'

jest.setTimeout(1000 * 60 * 5)

const run = (args, options) => execa('node', [cli].concat(args), options)

async function usingTempDir(fn, options) {
  const folder = path.join(os.tmpdir(), Math.random().toString(36).substring(2))
  await fs.mkdirp(folder, options)
  try {
    await fn(folder)
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
        expect(
          fs.existsSync(path.join(cwd, projectName, '.eslintrc'))
        ).toBeTruthy()
        expect(
          fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
        ).toBe(true)
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
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
    })
  })

  it('should support typescript flag', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'typescript'
      const res = await run([projectName, '--typescript'], { cwd })
      expect(res.exitCode).toBe(0)

      const pkgJSONPath = path.join(cwd, projectName, 'package.json')

      expect(fs.existsSync(pkgJSONPath)).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'pages/index.tsx'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'pages/_app.tsx'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'pages/api/hello.ts'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'tsconfig.json'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'next-env.d.ts'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, '.eslintrc'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
      // check we copied default `.gitignore`
      expect(
        fs.existsSync(path.join(cwd, projectName, '.gitignore'))
      ).toBeTruthy()

      // Assert for dependencies specific to the typescript template
      const pkgJSON = require(pkgJSONPath)
      expect(Object.keys(pkgJSON.dependencies)).toEqual([
        'next',
        'react',
        'react-dom',
      ])
      expect(Object.keys(pkgJSON.devDependencies)).toEqual([
        '@types/react',
        'eslint',
        'eslint-config-next',
        'typescript',
      ])
    })
  })

  it('should allow example with GitHub URL', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'github-app'
      const res = await run(
        [projectName, '--example', `${exampleRepo}/${examplePath}`],
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
        fs.existsSync(path.join(cwd, projectName, '.gitignore'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
    })
  })

  it('should allow example with GitHub URL and example-path', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'github-example-path'
      const res = await run(
        [projectName, '--example', exampleRepo, '--example-path', examplePath],
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
        fs.existsSync(path.join(cwd, projectName, '.gitignore'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
    })
  })

  it('should use --example-path over the file path in the GitHub URL', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'github-example-path-2'
      const res = await run(
        [
          projectName,
          '--example',
          `${exampleRepo}/${examplePath}`,
          '--example-path',
          examplePath,
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
        fs.existsSync(path.join(cwd, projectName, '.gitignore'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
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

        const files = [
          'package.json',
          'pages/index.js',
          '.gitignore',
          '.eslintrc',
        ]
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
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
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

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        'node_modules/next',
        '.eslintrc',
      ]
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

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        'node_modules/next',
        '.eslintrc',
      ]
      files.forEach((file) =>
        expect(fs.existsSync(path.join(cwd, projectName, file))).toBeTruthy()
      )
    })
  })

  it('should use npm as the package manager on supplying --use-npm', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run([projectName, '--use-npm'], { cwd })
      expect(res.exitCode).toBe(0)

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        '.eslintrc',
        'package-lock.json',
        'node_modules/next',
      ]
      files.forEach((file) =>
        expect(fs.existsSync(path.join(cwd, projectName, file))).toBeTruthy()
      )
    })
  })

  it('should use npm as the package manager on supplying --use-npm with example', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'use-npm'
      const res = await run(
        [
          projectName,
          '--use-npm',
          '--example',
          'https://github.com/vercel/next-learn-starter/tree/master/learn-starter',
        ],
        { cwd }
      )
      expect(res.exitCode).toBe(0)

      const files = [
        'package.json',
        'pages/index.js',
        '.gitignore',
        'package-lock.json',
        'node_modules/next',
      ]
      files.forEach((file) =>
        expect(fs.existsSync(path.join(cwd, projectName, file))).toBeTruthy()
      )
    })
  })
})
