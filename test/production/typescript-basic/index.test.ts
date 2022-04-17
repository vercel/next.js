import path from 'path'
import { createNext, FileRef } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('TypeScript basic', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(path.join(__dirname, 'app/pages')),
        'server.ts': `
          import next from 'next';
          const app = next({
            dir: '.',
            dev: process.env.NODE_ENV !== 'production',
            conf: {
              compress: false,
            },
            quiet: false,
          });
          const requestHandler = app.getRequestHandler();
        `,
      },
      dependencies: {
        typescript: 'latest',
        '@types/node': 'latest',
        '@types/react': 'latest',
        '@types/react-dom': 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  it('have built and started correctly', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
