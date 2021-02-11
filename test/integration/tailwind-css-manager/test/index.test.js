/* eslint-env jest */

import { writeFileSync } from 'fs'
import { readFile, remove } from 'fs-extra'
import { nextBuild } from 'next-test-utils'
import path from 'path'

const defaultConfig = `module.exports = {
  purge: [],
  darkMode: false,
  theme: {
    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [],
}`

const postCssConfig = `module.exports = { plugins: [] }`

jest.setTimeout(1000 * 60)

describe('TailwindCSS Manager', () => {
  const appDir = path.join(__dirname, '../')
  const configFilename = path.join(appDir, 'tailwind.config.js')
  const postCssConfigFilename = path.join(appDir, 'postcss.config.js')

  beforeEach(async () => {
    await remove(path.join(appDir, '.next'))
    await remove(configFilename)
    await remove(postCssConfigFilename)
  })

  afterEach(async () => {
    await remove(configFilename)
    await remove(postCssConfigFilename)
  })

  it('should not be active if there is no tailwind.config.js', async () => {
    const { code, stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(code).toBe(0)
    expect(stdout).not.toContain('.css')
  })

  it('should not be active if there is tailwind.config.js and postcss.config.js', async () => {
    writeFileSync(configFilename, defaultConfig)
    writeFileSync(postCssConfigFilename, postCssConfig)
    const { code, stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(code).toBe(0)
    expect(stdout).not.toContain('.css')
  })

  it('should add purge defaults to tailwind.config.js and should become active', async () => {
    writeFileSync(configFilename, defaultConfig)
    const { code, stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(code).toBe(0)
    expect(stdout).toContain('.css')
    expect(await readFile(configFilename, 'utf8')).toMatchInlineSnapshot(`
        "module.exports = {
          purge: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
          darkMode: false,
          theme: {
            extend: {},
          },
          variants: {
            extend: {},
          },
          plugins: [],
        }"
    `)
  })

  it('should not modify purge configuration if it is already set and should become active', async () => {
    const config = defaultConfig.replace(
      'purge: []',
      "purge: ['./pages/**/*.{js,ts,jsx,tsx}']"
    )
    writeFileSync(configFilename, config)
    const { code, stdout } = await nextBuild(appDir, [], { stdout: true })
    expect(code).toBe(0)
    expect(stdout).toContain('.css')
    expect(await readFile(configFilename, 'utf8')).toBe(config)
  })
})
