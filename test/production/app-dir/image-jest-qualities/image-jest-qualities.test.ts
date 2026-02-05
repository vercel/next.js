import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import path from 'path'
import execa from 'execa'

const appDir = path.join(__dirname, 'app')

describe('next/jest image qualities config', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        app: new FileRef(path.join(appDir, 'app')),
        'jest.config.js': `
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const customJestConfig = {
  testEnvironment: 'jsdom',
}

module.exports = createJestConfig(customJestConfig)
        `,
        'next.config.js': `
module.exports = {
  images: {
    qualities: [90, 100],
  },
}
        `,
        [`tests/image.test.tsx`]: `
import { getImageProps } from 'next/image'

describe('Image quality config', () => {
  it('respects custom qualities from next.config.js', () => {
    const { props } = getImageProps({
      alt: 'Test image',
      src: '/test.jpg',
      width: 500,
      height: 500,
      quality: 100,
    })
    
    // Should use quality=100 from our config, not default q=75
    expect(props.srcSet).toContain('q=100')
    expect(props.srcSet).not.toContain('q=75')
  })

  it('uses custom qualities for srcset generation', () => {
    const { props } = getImageProps({
      alt: 'Test image',
      src: '/test.jpg',
      width: 500,
      height: 500,
      sizes: '100vw',
    })
    
    // Should generate srcset with our custom qualities [90, 100]
    // and not include default quality 75
    const srcSetEntries = props.srcSet?.split(',') || []
    const hasCustomQualities = srcSetEntries.some(entry => 
      entry.includes('q=90') || entry.includes('q=100')
    )
    const hasDefaultQuality = srcSetEntries.some(entry => 
      entry.includes('q=75')
    )
    
    expect(hasCustomQualities).toBe(true)
    expect(hasDefaultQuality).toBe(false)
  })
})
        `,
      },
    })
  })

  afterAll(() => next.destroy())

  it('should pass jest tests with custom image qualities', async () => {
    const result = await execa(
      'pnpm',
      ['jest', 'tests/image.test.tsx', '--forceExit', '--verbose'],
      {
        cwd: next.testDir,
        reject: false,
      }
    )
    const output = result.stdout || result.stderr || ''
    console.log('Jest output:', output)
    expect(output).toContain('PASS')
    expect(output).toMatch(/2 passed/)
  })
})
