/**
 * rspack + Yarn PnP: build output must reflect .pnp.cjs when it changes.
 *
 * Setup : fetch both lodash@4.17.21 and @4.17.23 into the global yarn cache so
 *         both zips coexist; install @4.17.21 as the active version and save the
 *         @4.17.23 .pnp.cjs as .pnp.cjs.v2.
 * Build1: rspack compiles → HTML contains "4.17.21".
 * Swap  : replace .pnp.cjs with .pnp.cjs.v2 (simulates `yarn install` upgrade).
 * Build2: must bundle the updated lodash@4.17.23 — HTML shows "4.17.23".
 */

import path from 'path'
import fs from 'fs-extra'
import { createNext, isNextDeploy, isNextDev } from 'e2e-utils'
import type { NextInstance } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'

jest.setTimeout(15 * 60 * 1000)

if (isNextDeploy || isNextDev || shouldUseTurbopack()) {
  it('skipped: production-rspack-only test', () => {})
} else {
  describe('rspack + yarn pnp — cache invalidated on .pnp.cjs change', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'app/layout.tsx': `
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}</body></html>
}
`,
          'app/page.tsx': `
import _ from 'lodash'
export default function Page() {
  return <p id="version">{_.VERSION}</p>
}
`,
        },
        dependencies: { 'next-rspack': '*' },
        installCommand: () =>
          [
            'yarn set version berry',
            'yarn config set nodeLinker pnp',
            'yarn add lodash@4.17.23',
            'cp .pnp.cjs .pnp.cjs.v2',
            'yarn add lodash@4.17.21',
          ].join(' && '),
        buildCommand: 'yarn next build',
        startCommand: 'yarn next start',
        env: { NEXT_RSPACK: '1', IS_WEBPACK_TEST: '' },
      })
      // We only need the build output, not a running server.
      await next.stop()
    })

    afterAll(() => next?.destroy())

    it('bundles the updated version after .pnp.cjs is swapped', async () => {
      const htmlPath = path.join(
        next.testDir,
        next.distDir ?? '.next',
        'server/app/index.html'
      )

      // Build 1 was done during beforeAll (createNext).
      expect(lodashVersion(await fs.readFile(htmlPath, 'utf-8'))).toBe(
        '4.17.21'
      )

      // Swap .pnp.cjs to the version that resolves lodash@4.17.23.
      // The @4.17.23 zip already exists in the global yarn cache.
      await fs.copy(
        path.join(next.testDir, '.pnp.cjs.v2'),
        path.join(next.testDir, '.pnp.cjs'),
        { overwrite: true }
      )

      const build2 = await next.build()
      expect(build2.exitCode).toBe(0)
      expect(lodashVersion(await fs.readFile(htmlPath, 'utf-8'))).toBe(
        '4.17.23'
      )
    })
  })
}

function lodashVersion(html: string): string | null {
  return html.match(/4\.17\.\d+/)?.[0] ?? null
}
