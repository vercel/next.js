/* eslint-env jest */
import { findConfig } from 'next/dist/lib/find-config'
import { join } from 'path'
const fixtureDir = join(__dirname, 'fixtures')

describe('find config', () => {
  it('should resolve rc.json', async () => {
    const config = await findConfig(join(fixtureDir, 'config-json'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })
  describe('json config', () => {
    it('should resolve rc.json', async () => {
      const config = await findConfig(join(fixtureDir, 'config-json'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

  it('should resolve rc.js', async () => {
    const config = await findConfig(join(fixtureDir, 'config-js'), 'test')
    expect(config).toEqual({ foo: 'bar' })
    it('should resolve .config.json', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-json'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })
  })

  it('should resolve .config.json', async () => {
    const config = await findConfig(
      join(fixtureDir, 'config-long-json'),
      'test'
    )
    expect(config).toEqual({ foo: 'bar' })
  })
  describe('javascript config', () => {
    it('should resolve rc.js', async () => {
      const config = await findConfig(join(fixtureDir, 'config-js'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

  it('should resolve .config.js', async () => {
    const config = await findConfig(join(fixtureDir, 'config-long-js'), 'test')
    expect(config).toEqual({ foo: 'bar' })
    it('should resolve rc.cjs', async () => {
      const config = await findConfig(join(fixtureDir, 'config-cjs'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

    // requires the --experimental-vm-modules flag to be passed to Node to pass
    it.skip('should resolve rc.mjs', async () => {
      const config = await findConfig(join(fixtureDir, 'config-mjs'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve .config.js', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-js'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve .config.cjs', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-cjs'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })

    // requires the --experimental-vm-modules flag to be passed to Node to pass
    it.skip('should resolve .config.mjs', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-mjs'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })
  })

  it('should resolve .config.cjs', async () => {
    const config = await findConfig(join(fixtureDir, 'config-long-cjs'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  describe('typescript config', () => {
    it('should resolve rc.ts', async () => {
      const config = await findConfig(join(fixtureDir, 'config-ts'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve rc.cts', async () => {
      const config = await findConfig(join(fixtureDir, 'config-cts'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve rc.mts', async () => {
      const config = await findConfig(join(fixtureDir, 'config-mts'), 'test')
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve .config.ts', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-ts'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve .config.cts', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-cts'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })

    it('should resolve .config.mts', async () => {
      const config = await findConfig(
        join(fixtureDir, 'config-long-mts'),
        'test'
      )
      expect(config).toEqual({ foo: 'bar' })
    })
  })

  it('should resolve package.json', async () => {
    const config = await findConfig(
      join(fixtureDir, 'config-package-json'),
      'test'
    )
    expect(config).toEqual({ foo: 'bar' })
  })
  it('should resolve down', async () => {
    const config = await findConfig(
      join(fixtureDir, 'config-down/one/two/three/'),
      'test'
    )
    expect(config).toEqual({ foo: 'bar' })
  })
})
