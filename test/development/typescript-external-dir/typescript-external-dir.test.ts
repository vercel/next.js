import { join } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'

describe('typescript-external-dir', () => {
  const { next } = nextTestSetup({
    files: {
      project: new FileRef(join(__dirname, 'project')),
      shared: new FileRef(join(__dirname, 'shared')),
    },
    // Run Next.js from inside `project/` so its `tsconfig.json` `paths`
    // resolve correctly. `shared/` is a sibling at the install root, which
    // contains the lockfile, so Turbopack's `rootPath` includes both
    // directories and `experimental.externalDir` resolves
    // `../../shared/*` from `project/pages`.
    packageJson: {
      scripts: {
        'dev-project': `cd project && next dev${
          shouldUseTurbopack() ? ' --turbopack' : ''
        }`,
      },
    },
    startCommand: 'pnpm run dev-project',
  })

  it('should render the page with external TS/TSX dependencies', async () => {
    const $ = await next.render$('/')
    expect($('body').text()).toMatch(/Hello World!Counter: 0/)
  })
})
