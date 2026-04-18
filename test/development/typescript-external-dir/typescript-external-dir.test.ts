import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'

describe('typescript-external-dir', () => {
  const { next } = nextTestSetup({
    files: {
      project: new FileRef(join(__dirname, 'project')),
      shared: new FileRef(join(__dirname, 'shared')),
    },
    startCommand: `pnpm next dev project${
      shouldUseTurbopack() ? ' --turbopack' : ''
    }`,
  })

  it('should render the page with external TS/TSX dependencies', async () => {
    const $ = await next.render$('/')
    expect($('body').text()).toMatch(/Hello World!Counter: 0/)
  })
})
