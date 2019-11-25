/* eslint-env jest */
import { getConfig } from 'next/dist/lib/load-config'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

describe('load config', () => {
  it('should resolve rc.json', async () => {
    const config = await getConfig(join(fixtureDir, 'config-json'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve rc (no ext)', async () => {
    const config = await getConfig(join(fixtureDir, 'config-no-ext'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve package.json', async () => {
    const config = await getConfig(
      join(fixtureDir, 'config-package-json'),
      'test'
    )
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve config.json', async () => {
    const config = await getConfig(join(fixtureDir, 'dot-config-json'), 'test')
    expect(config).toEqual({ foo: 'bar' })
  })

  it('should resolve down', async () => {
    const config = await getConfig(
      join(fixtureDir, 'config-down/one/two/three/'),
      'test'
    )
    expect(config).toEqual({ foo: 'bar' })
  })
})
