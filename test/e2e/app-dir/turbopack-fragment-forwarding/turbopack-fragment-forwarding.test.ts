import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'

describe('turbopack-fragment-forwarding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('preserves mutable bindings through named and namespace reexports', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('42:42:42:42:42')
  })

  // Deployment does not expose local build artifacts; binding behavior is covered above.
  // @force-gate start && turbopack
  it('eliminates the unused export from server chunks', async () => {
    const chunks = join(next.testDir, '.next/server/chunks/ssr')
    const files = (await readdir(chunks)).filter((file) => file.endsWith('.js'))
    expect(files.length).toBeGreaterThan(0)
    const output = (
      await Promise.all(
        files.map((file) => readFile(join(chunks, file), 'utf8'))
      )
    ).join('\n')
    expect(output).not.toContain('UNUSED_FRAGMENT_FORWARDING_EXPORT')
  })

  // The generated module registrations are only available in local production builds.
  // @force-gate start && turbopack
  it('registers the page template exports only once', async () => {
    const chunks = join(next.testDir, '.next/server/chunks/ssr')
    const files = (await readdir(chunks)).filter(
      (file) => file.includes('app-page') && file.endsWith('.js')
    )
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const output = await readFile(join(chunks, file), 'utf8')
      expect(output.match(/"captureOwnerStack"/g)).toHaveLength(1)
    }
  })
})
