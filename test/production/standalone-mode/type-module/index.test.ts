import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'
import fs from 'fs-extra'
import cheerio from 'cheerio'
import {
  fetchViaHTTP,
  findPort,
  initNextServerScript,
  killApp,
} from 'next-test-utils'

describe('type-module', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should work', async () => {
    await next.stop()
    const standalonePath = join(next.testDir, '.next/standalone')

    expect(fs.existsSync(join(standalonePath, 'package.json'))).toBe(true)

    // The distDir package.json acts as a commonjs boundary marker so that
    // server bundles in `.next/server/**/*.js` are loaded as CJS even when
    // the user's project has `"type": "module"`. Without this file, Node
    // walks up to the project package.json and tries to load the server
    // bundles as ESM, which fails at runtime.
    const distPackageJsonPath = join(standalonePath, '.next', 'package.json')
    expect(fs.existsSync(distPackageJsonPath)).toBe(true)
    expect(JSON.parse(await fs.readFile(distPackageJsonPath, 'utf8'))).toEqual({
      type: 'commonjs',
    })

    const serverFile = join(standalonePath, 'server.js')

    const appPort = await findPort()
    const server = await initNextServerScript(
      serverFile,
      /- Local:/,
      { ...process.env, ...next.env, PORT: appPort.toString() },
      undefined,
      { cwd: next.testDir }
    )
    const staticRes = await fetchViaHTTP(appPort, '/')
    expect(await staticRes.text()).toContain('hello world')

    // Hitting a server-rendered page forces Node to actually load
    // `.next/server/pages/dynamic.js` at runtime, which only succeeds when
    // the distDir commonjs boundary is in place.
    const dynamicRes = await fetchViaHTTP(appPort, '/dynamic')
    expect(dynamicRes.status).toBe(200)
    const $ = cheerio.load(await dynamicRes.text())
    expect($('#content').text()).toBe('dynamic-rendered-at-runtime')

    await killApp(server)
  })
})
