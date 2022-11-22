/* eslint-env jest */
import { findConfig } from 'next/dist/lib/find-config'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

describe('find config', () => {
  it('should resolve rc.json', async () => {
    const config = await findConfig(join(fixtureDir, 'config-json'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve rc.js', async () => {
    const config = await findConfig(join(fixtureDir, 'config-js'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve .config.json', async () => {
    const config = await findConfig(
      join(fixtureDir, 'config-long-json'),
      'test'
    )
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve .config.js', async () => {
    const config = await findConfig(join(fixtureDir, 'config-long-js'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve .config.cjs', async () => {
    const config = await findConfig(join(fixtureDir, 'config-long-cjs'), 'test')
    expect(config).toEqual({ foo: 'bar' })
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
