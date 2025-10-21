import { nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

const errorMessage = `The file "./proxy.ts" must export a function, either as a default export or as a named "proxy" export.
This function is what Next.js runs for every request handled by this proxy (previously called middleware).

Why this happens:
- You are migrating from \`middleware\` to \`proxy\`, but haven't updated the exported function.
- The file exists but doesn't export a function.
- The export is not a function (e.g., an object or constant).
- There's a syntax error preventing the export from being recognized.

To fix it:
- Check your "./proxy.ts" file.
- Ensure it has either a default or "proxy" function export.

Learn more: https://nextjs.org/docs/messages/middleware-to-proxy`

describe('proxy-missing-export', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  if (skipped) {
    return
  }

  it('should error when proxy file has invalid export named middleware', async () => {
    await writeFile(
      join(next.testDir, 'proxy.ts'),
      'export function middleware() {}'
    )

    if (isNextDev) {
      await next.start().catch(() => {})
      // Use .catch() because Turbopack errors during compile and exits before runtime.
      await next.browser('/').catch(() => {})
      expect(next.cliOutput).toContain(errorMessage)
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(errorMessage)
    }

    await next.stop()
  })

  it('should NOT error when proxy file has a default function export', async () => {
    await writeFile(
      join(next.testDir, 'proxy.ts'),
      'export default function handler() {}'
    )

    await next.start()

    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.stop()
  })

  it('should NOT error when proxy file has a default arrow function export', async () => {
    await writeFile(join(next.testDir, 'proxy.ts'), 'export default () => {}')

    await next.start()

    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.stop()
  })

  it('should NOT error when proxy file has a named declaration function export', async () => {
    await writeFile(
      join(next.testDir, 'proxy.ts'),
      'const proxy = function() {}; export { proxy };'
    )

    await next.start()

    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.stop()
  })

  it('should NOT error when proxy file has a named declaration arrow function export', async () => {
    await writeFile(
      join(next.testDir, 'proxy.ts'),
      'const proxy = () => {}; export { proxy };'
    )

    await next.start()

    const browser = await next.browser('/')
    expect(await browser.elementByCss('p').text()).toBe('hello world')

    await next.stop()
  })

  it('should error when proxy file has a named export with different name alias', async () => {
    await writeFile(
      join(next.testDir, 'proxy.ts'),
      'const proxy = () => {}; export { proxy as handler };'
    )

    if (isNextDev) {
      await next.start().catch(() => {})
      // Use .catch() because Turbopack errors during compile and exits before runtime.
      await next.browser('/').catch(() => {})
      expect(next.cliOutput).toContain(errorMessage)
    } else {
      const { cliOutput } = await next.build()
      expect(cliOutput).toContain(errorMessage)
    }

    await next.stop()
  })
})
