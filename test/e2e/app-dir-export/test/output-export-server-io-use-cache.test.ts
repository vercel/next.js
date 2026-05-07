import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import fs from 'fs-extra'

const { next, skipped, isNextDev } = nextTestSetup({
  files: join(__dirname, '..', 'fixtures', 'output-export-server-io-use-cache'),
  skipStart: true,
  skipDeployment: true,
  disableAutoSkewProtection: true,
})

if (skipped) {
  describe.skip('app dir - output export server io use cache', () => {})
} else {
  const describeProduction = isNextDev ? describe.skip : describe

  describeProduction('app dir - output export server io use cache', () => {
    let cliOutput: string

    beforeAll(async () => {
      const result = await next.build()

      if (result.exitCode !== 0) {
        throw new Error(`Expected build to pass:\n${result.cliOutput}`)
      }

      cliOutput = result.cliOutput
    })

    afterAll(async () => {
      await next.destroy()
    })

    it('exports Date.now() successfully when the read is wrapped in use cache', async () => {
      const html = await fs.readFile(
        join(next.testDir, 'out', 'cached-time.html'),
        'utf8'
      )

      expect(cliOutput).not.toContain('used `Date.now()`')
      expect(html).toContain('Cached time')
      expect(html).toMatch(/<h1 id="value">\d+<\/h1>/)
    })

    it('exports Math.random() successfully when the read is wrapped in use cache', async () => {
      const html = await fs.readFile(
        join(next.testDir, 'out', 'cached-random.html'),
        'utf8'
      )

      expect(cliOutput).not.toContain('used `Math.random()`')
      expect(html).toContain('Cached random')
      expect(html).toMatch(/<h1 id="value">0?\.\d+<\/h1>/)
    })

    it('exports crypto.randomUUID() successfully when the read is wrapped in use cache', async () => {
      const html = await fs.readFile(
        join(next.testDir, 'out', 'cached-crypto.html'),
        'utf8'
      )

      expect(cliOutput).not.toContain('used `crypto.randomUUID()`')
      expect(html).toContain('Cached crypto')
      expect(html).toMatch(
        /<h1 id="value">[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}<\/h1>/i
      )
    })
  })
}
