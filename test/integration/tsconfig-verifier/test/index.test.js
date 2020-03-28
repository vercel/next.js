/* eslint-env jest */
/* global jasmine */
import path from 'path'
import {
  exists,
  remove,
  readFile,
  readJSON,
  writeJSON,
  createFile,
} from 'fs-extra'

import { launchApp, findPort, killApp, renderViaHTTP } from 'next-test-utils'

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60 * 5

describe('Fork ts checker plugin', () => {
  const appDir = path.join(__dirname, '../')
  const tsConfig = path.join(appDir, 'tsconfig.json')
  let appPort
  let app

  beforeAll(async () => {
    appPort = await findPort()
    app = await launchApp(appDir, appPort)
  })

  afterAll(async () => {
    await killApp(app)
    await remove(tsConfig)
  })

  it('Creates a default tsconfig.json when one is missing', async () => {
    expect(await exists(tsConfig)).toBe(true)

    const tsConfigContent = await readFile(tsConfig)
    let parsedTsConfig
    expect(() => {
      parsedTsConfig = JSON.parse(tsConfigContent)
    }).not.toThrow()

    expect(parsedTsConfig.exclude[0]).toBe('node_modules')
  })

  it('Works with an empty tsconfig.json (docs)', async () => {
    await killApp(app)

    await remove(tsConfig)
    await new Promise(resolve => setTimeout(resolve, 500))

    expect(await exists(tsConfig)).toBe(false)

    await createFile(tsConfig)
    await new Promise(resolve => setTimeout(resolve, 500))

    expect(await readFile(tsConfig, 'utf8')).toBe('')

    await killApp(app)
    await new Promise(resolve => setTimeout(resolve, 500))

    appPort = await findPort()
    app = await launchApp(appDir, appPort)

    const tsConfigContent = await readFile(tsConfig)
    let parsedTsConfig
    expect(() => {
      parsedTsConfig = JSON.parse(tsConfigContent)
    }).not.toThrow()

    expect(parsedTsConfig.exclude[0]).toBe('node_modules')
  })

  it('Throws error if there is an existing tsconfig.json with a different required value', async () => {
    await killApp(app)

    let parsedTsConfig = await readJSON(tsConfig)
    parsedTsConfig.compilerOptions.esModuleInterop = false

    await writeJSON(tsConfig, parsedTsConfig)
    let output = ''
    appPort = await findPort()
    app = await launchApp(appDir, appPort, {
      onStdout: msg => (output += msg),
      onStderr: msg => (output += msg),
    })

    expect(output).toMatch(
      /The following changes are required for next.js, please update your tsconfig.json file:/
    )
    expect(output).toMatch(
      /- compilerOptions.esModuleInterop must be true \(requirement for babel\)/
    )

    // Check if the tsconfig file is not overriden.
    parsedTsConfig = await readJSON(tsConfig)
    expect(parsedTsConfig.compilerOptions.esModuleInterop).toBe(false)
    await remove(tsConfig)
  })

  it('Renders a TypeScript page correctly', async () => {
    app = await launchApp(appDir, appPort)
    const html = await renderViaHTTP(appPort, '/')
    expect(html).toMatch(/Hello TypeScript/)
  })
})
