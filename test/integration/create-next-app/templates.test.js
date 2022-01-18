/* eslint-env jest */
import execa from 'execa'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'

const cli = require.resolve('create-next-app/dist/index.js')

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

describe('create-next-app templates', () => {
  it('should use TypeScript by default', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'typescript-test'
      const res = await run([projectName], { cwd })
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
        fs.existsSync(path.join(cwd, projectName, '.eslintrc.json'))
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
        '@types/node',
        '@types/react',
        'eslint',
        'eslint-config-next',
        'typescript',
      ])
    })
  })

  it('should create JS projects with --js, --javascript', async () => {
    await usingTempDir(async (cwd) => {
      const projectName = 'javascript-test'
      const res = await run([projectName, '--js'], { cwd })
      expect(res.exitCode).toBe(0)

      const pkgJSONPath = path.join(cwd, projectName, 'package.json')

      expect(fs.existsSync(pkgJSONPath)).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'pages/index.js'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'pages/_app.js'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'pages/api/hello.js'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, '.eslintrc.json'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'node_modules/next'))
      ).toBe(true)
      // check we copied default `.gitignore`
      expect(
        fs.existsSync(path.join(cwd, projectName, '.gitignore'))
      ).toBeTruthy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'tsconfig.json'))
      ).toBeFalsy()
      expect(
        fs.existsSync(path.join(cwd, projectName, 'next-env.d.ts'))
      ).toBeFalsy()

      // Assert for dependencies specific to the typescript template
      const pkgJSON = require(pkgJSONPath)
      expect(Object.keys(pkgJSON.dependencies)).toEqual([
        'next',
        'react',
        'react-dom',
      ])
      expect(Object.keys(pkgJSON.devDependencies)).toEqual([
        'eslint',
        'eslint-config-next',
      ])
    })
  })
})
