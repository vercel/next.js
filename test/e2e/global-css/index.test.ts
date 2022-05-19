import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('global-css', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          import { Button } from '@patternfly/react-core';

          export default function Page() { 
            return <Button variant="primary">hello world</Button>
          }
        `,
      },
      nextConfig: {
        experimental: {
          craCompat: true,
        },
      },
      dependencies: {
        '@patternfly/react-core': '4.198.19',
      },
    })
  })
  afterAll(() => next.destroy())

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
