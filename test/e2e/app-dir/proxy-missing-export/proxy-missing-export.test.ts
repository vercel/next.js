import { nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'

const errorMessage = `This function is what Next.js runs for every request handled by this proxy (previously called middleware).

Why this happens:
- You are migrating from \`middleware\` to \`proxy\`, but haven't updated the exported function.
- The file exists but doesn't export a function.
- The export is not a function (e.g., an object or constant).
- There's a syntax error preventing the export from being recognized.

To fix it:
- Ensure this file has either a default or "proxy" function export.

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

    let cliOutput: string

    if (isNextDev) {
      await next.start().catch(() => {})
      // Use .catch() because Turbopack errors during compile and exits before runtime.
      await next.browser('/').catch(() => {})
      cliOutput = next.cliOutput
    } else {
      cliOutput = (await next.build()).cliOutput
    }

    // TODO: Investigate why in dev-turbo, the error is shown in the browser console, not CLI output.
    if (process.env.IS_TURBOPACK_TEST && !isNextDev) {
      expect(cliOutput).toContain(`./proxy.ts
Proxy is missing expected function export name
${errorMessage}`)
    } else {
      expect(cliOutput)
        .toContain(`The file "./proxy.ts" must export a function, either as a default export or as a named "proxy" export.
${errorMessage}`)
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

    let cliOutput: string

    if (isNextDev) {
      await next.start().catch(() => {})
      // Use .catch() because Turbopack errors during compile and exits before runtime.
      await next.browser('/').catch(() => {})
      cliOutput = next.cliOutput
    } else {
      cliOutput = (await next.build()).cliOutput
    }

    // TODO: Investigate why in dev-turbo, the error is shown in the browser console, not CLI output.
    if (process.env.IS_TURBOPACK_TEST && !isNextDev) {
      expect(cliOutput).toContain(`./proxy.ts
Proxy is missing expected function export name
${errorMessage}`)
    } else {
      expect(cliOutput)
        .toContain(`The file "./proxy.ts" must export a function, either as a default export or as a named "proxy" export.
${errorMessage}`)
    }
    await next.stop()
  })
})
