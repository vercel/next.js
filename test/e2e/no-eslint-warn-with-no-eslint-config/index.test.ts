import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { renderViaHTTP } from 'next-test-utils'

describe('no-eslint-warn-with-no-eslint-config', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'pages/index.js': `
          export default function Page() { 
            return <p>hello world</p>
          } 
        `,
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  it('should render', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })

  it('should not have eslint warnings when no eslint config', async () => {
    expect(next.cliOutput).not.toContain(
      'No ESLint configuration detected. Run next lint to begin setup'
    )
    expect(next.cliOutput).not.toBe('warn')
  })
})
