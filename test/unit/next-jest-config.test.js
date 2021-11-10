/* eslint-env jest */
import path from 'path'
import { loadNextConfig } from 'next/dist/build/swc/jest'

describe('next/jest config loading', () => {
  it('should work with no config', () => {
    let jestOptions = {
      config: {
        transform: [['.+\\.(t|j)sx?$', 'next/jest']],
      },
    }
    let nextConfig = loadNextConfig(jestOptions, __dirname)
    expect(nextConfig).toBeUndefined()
  })

  it('should load next.config.js', () => {
    let jestOptions = {
      config: {
        transform: [['.+\\.(t|j)sx?$', 'next/jest']],
      },
    }
    let nextConfig = loadNextConfig(
      jestOptions,
      path.join(__dirname, 'next-jest-config')
    )
    expect(nextConfig.someKey).toBe('someValue')
  })

  it('should load the configured override file', () => {
    let jestOptions = {
      config: {
        transform: [
          [
            '.+\\.(t|j)sx?$',
            'next/jest',
            { configFile: 'next.override.config.js' },
          ],
        ],
      },
    }
    let nextConfig = loadNextConfig(
      jestOptions,
      path.join(__dirname, 'next-jest-config')
    )
    expect(nextConfig.someKey).toBe('someOtherValue')
  })

  it('should load the configured override file with absolute path', () => {
    let jestOptions = {
      config: {
        transform: [
          [
            '.+\\.(t|j)sx?$',
            'next/jest',
            {
              configFile: path.join(
                __dirname,
                'next-jest-config',
                'next.override.config.js'
              ),
            },
          ],
        ],
      },
    }
    let nextConfig = loadNextConfig(
      jestOptions,
      path.join(__dirname, 'next-jest-config')
    )
    expect(nextConfig.someKey).toBe('someOtherValue')
  })
})
