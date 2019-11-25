/* eslint-env jest */
import { findConfig } from 'next/dist/lib/find-config'
import { join } from 'path'

const fixtureDir = join(__dirname, 'fixtures')

describe('find config', () => {
  it('should resolve rc.json', async () => {
    const config = await findConfig(join(fixtureDir, 'config-json'), 'test')
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
