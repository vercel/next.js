import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('experimental-warning', () => {
  let next: NextInstance

  afterAll(() => next.destroy())

  it('should not print experimental warning if no experimental key', async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return 'hi'
          } 
        `,
        'next.config.js': `
          module.exports = {
            images: {
              // nothing
            },
          }
        `,
      },
      dependencies: {},
    })

    expect(next.cliOutput).not.toContain('You have enabled experimental')
  })

  it('should print experimental warning with single key', async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return 'hi'
          } 
        `,
        'next.config.js': `
          module.exports = {
            experimental: {
              foo: true,
            },
          }
        `,
      },
      dependencies: {},
    })

    expect(next.cliOutput).toContain(
      'You have enabled experimental feature (foo) in next.config.js.'
    )
  })

  it('should print experimental warning with multiple keys', async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return 'hi'
          } 
        `,
        'next.config.js': `
          module.exports = {
            experimental: {
              foo: true,
              bar: 'baz',
            },
          }
        `,
      },
      dependencies: {},
    })

    expect(next.cliOutput).toContain(
      'You have enabled experimental features (foo, bar) in next.config.js.'
    )
  })

  it('should print experimental warning with .mjs', async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return 'hi'
          } 
        `,
        'next.config.mjs': `
          module.exports = {
            experimental: {
              foo: true,
            },
          }
        `,
      },
      dependencies: {},
    })

    expect(next.cliOutput).toContain(
      'You have enabled experimental feature (foo) in next.config.mjs.'
    )
  })
})
