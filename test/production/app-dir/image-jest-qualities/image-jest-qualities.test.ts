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
        'next.config.js': `
module.exports = {
  images: {
    qualities: [90, 100],
  },
}
        `,
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
        [`tests/image.test.tsx`]: `
import Image from 'next/image'
import { render, screen } from '@testing-library/react'

describe('Image quality config', () => {
  it('respects custom qualities from next.config.js', () => {
    render(
      <Image
        src="/test.jpg"
        alt="test"
        width={500}
        height={500}
        quality={100}
      />
    )

    const img = screen.getByRole('img')

    // Should use quality=100 from our config, not default q=75
    expect(img.getAttribute('src')).toContain('q=100')
    expect(img.getAttribute('src')).not.toContain('q=75')
  })

  it('uses custom qualities for srcset generation', () => {
    render(
      <Image
        src="/test.jpg"
        alt="test"
        width={500}
        height={500}
        sizes="100vw"
      />
    )

    const img = screen.getByRole('img')
    
    // Should generate srcset with our custom qualities [90, 100]
    // and not include default quality 75
    const srcSet = img.getAttribute('srcset') || ''
    const srcSetEntries = srcSet.split(',')
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
      dependencies: {
        jest: '29.7.0',
        'jest-environment-jsdom': '29.7.0',
        '@testing-library/react': '15.0.2',
        '@testing-library/jest-dom': '5.17.0',
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
