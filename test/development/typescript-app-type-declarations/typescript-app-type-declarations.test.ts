import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

// When `__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES=true` is set in CI, Next.js
// regenerates `next-env.d.ts` with additional `cache-life`/`validator`
// imports. The seed fixture must match that output so the very first read of
// `next-env.d.ts` (before any regeneration is observed) lines up with what
// Next.js will write back during the test.
const strictRouteTypes =
  process.env.__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES === 'true'

const nextEnvDts = strictRouteTypes
  ? `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";
import "./.next/dev/types/root-params.d.ts";
import "./.next/dev/types/cache-life.d.ts";
import "./.next/dev/types/validator.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/pages/api-reference/config/typescript for more information.
`
  : `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/dev/types/routes.d.ts";
import "./.next/dev/types/root-params.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/pages/api-reference/config/typescript for more information.
`

describe('typescript-app-type-declarations', () => {
  const { next } = nextTestSetup({
    files: {
      'pages/index.tsx': `
        export default function Index() {
          return <div />
        }
      `,
      'tsconfig.json': JSON.stringify({
        compilerOptions: {
          esModuleInterop: true,
          module: 'esnext',
          jsx: 'react-jsx',
          target: 'es2017',
          lib: ['dom', 'dom.iterable', 'esnext'],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          forceConsistentCasingInFileNames: true,
          noEmit: true,
          incremental: true,
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
        },
        exclude: ['node_modules', '**/*.test.ts', '**/*.test.tsx'],
        include: ['next-env.d.ts', 'components', 'pages'],
      }),
      'next-env.d.ts': nextEnvDts,
    },
    dependencies: {
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
    },
  })

  it('should write a new next-env.d.ts if none exist', async () => {
    const prevContent = await next.readFile('next-env.d.ts')
    await next.deleteFile('next-env.d.ts')
    // Next.js writes next-env.d.ts during dev server startup, so restart
    // the server to trigger regeneration (matching the original integration
    // test which started a fresh server per test).
    await next.stop()
    await next.start()
    await next.render('/')
    await retry(async () => {
      const content = await next.readFile('next-env.d.ts')
      expect(content).toEqual(prevContent)
    })
  })

  it('should overwrite next-env.d.ts if an incorrect one exists', async () => {
    const prevContent = await next.readFile('next-env.d.ts')
    await next.patchFile('next-env.d.ts', prevContent + 'modification')
    await next.stop()
    await next.start()
    await next.render('/')
    await retry(async () => {
      const content = await next.readFile('next-env.d.ts')
      expect(content).toEqual(prevContent)
    })
  })

  it('should not touch an existing correct next-env.d.ts', async () => {
    const envFile = path.join(next.testDir, 'next-env.d.ts')
    const prevContent = await next.readFile('next-env.d.ts')
    await next.patchFile('next-env.d.ts', prevContent)
    const prevStat = fs.statSync(envFile)
    await waitFor(1000)
    await next.render('/')
    const stat = fs.statSync(envFile)
    expect(stat.mtimeMs).toEqual(prevStat.mtimeMs)
  })
})
