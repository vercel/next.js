import { isNextDev, nextTestSetup } from 'e2e-utils'
import { renderViaHTTP } from 'next-test-utils'

describe('handle-non-hoisted-swc-helpers', () => {
  const { next } = nextTestSetup({
    files: {
      '.npmrc': `# The helper move below needs real package directories, not pnpm symlinks.
node-linker=hoisted
package-import-method=copy
`,
      'pages/index.js': `
        export default function Page() {
          return <p>hello world</p>
        }

        export function getServerSideProps() {
          const helper = require('@swc/helpers/_/_object_spread')
          console.log(helper)
          return {
            props: {
              now: Date.now()
            }
          }
        }
      `,
    },
    packageJson: {
      scripts: {
        build: 'next build',
        dev: 'next dev',
        start: 'next start',
      },
    },
    installCommand:
      'pnpm install && mkdir -p node_modules/next/node_modules/@swc && mv node_modules/@swc/helpers node_modules/next/node_modules/@swc/',
    buildCommand: 'pnpm run build',
    startCommand: isNextDev ? 'pnpm run dev' : 'pnpm run start',
    dependencies: {},
  })

  it('should work', async () => {
    const html = await renderViaHTTP(next.url, '/')
    expect(html).toContain('hello world')
  })
})
