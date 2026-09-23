import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import path from 'path'
import execa from 'execa'

const appDir = path.join(__dirname, 'app')

describe('next/jest custom image loader', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      skipStart: true,
      files: {
        'next.config.js': `
module.exports = {
  images: {
    loader: 'custom',
    loaderFile: './image-loader.js',
  },
}
        `,
        'image-loader.js': `
export default function customLoader({ src, width, quality }) {
  return \`https://cdn.example.com\${src}?w=\${width}&q=\${quality || 75}\`
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

describe('Image custom loader', () => {
  it('renders without the missing loader error when loaderFile is configured', () => {
    render(
      <Image
        src="/images/test.jpg"
        alt="test"
        width={500}
        height={500}
      />
    )

    const img = screen.getByRole('img')
    // The custom loader should produce a URL with cdn.example.com
    expect(img.getAttribute('src')).toContain('cdn.example.com')
  })

  it('uses the custom loader for srcset generation', () => {
    render(
      <Image
        src="/images/test.jpg"
        alt="test"
        width={500}
        height={500}
      />
    )

    const img = screen.getByRole('img')
    const srcSet = img.getAttribute('srcset') || ''
    // All srcset entries should use the custom loader URL
    expect(srcSet).toContain('cdn.example.com')
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

  it('should pass jest tests with custom image loader', async () => {
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
