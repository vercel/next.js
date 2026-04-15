import { nextTestSetup } from 'e2e-utils'

describe('Production Config Usage', () => {
  ;(process.env.TURBOPACK_DEV ? describe.skip : describe)(
    'production mode',
    () => {
      describe('with generateBuildId', () => {
        const { next } = nextTestSetup({ files: __dirname })

        it('should add the custom buildid', async () => {
          const browser = await next.browser('/')
          const text = await browser.elementByCss('#mounted').text()
          expect(text).toMatch(/ComponentDidMount executed on client\./)

          const html = await browser.eval('document.documentElement.innerHTML')
          expect(html).toMatch('custom-buildid')
          await browser.close()
        })
      })

      describe('env', () => {
        const { next } = nextTestSetup({
          files: __dirname,
          skipStart: true,
        })

        it('should fail with leading __ in env key', async () => {
          await next.patchFile(
            'next.config.js',
            `module.exports = {
  env: { __NEXT_MY_VAR: 'test' },
  onDemandEntries: { maxInactiveAge: 1000 * 60 * 60 },
  async generateBuildId() { return 'custom-buildid' },
}`
          )
          const start = next.cliOutput.length
          await next.build().catch(() => {})
          expect(next.cliOutput.slice(start)).toMatch(
            /The key "__NEXT_MY_VAR" under/
          )
        })

        it('should fail with NODE_ in env key', async () => {
          await next.patchFile(
            'next.config.js',
            `module.exports = {
  env: { NODE_ENV: 'abc' },
  onDemandEntries: { maxInactiveAge: 1000 * 60 * 60 },
  async generateBuildId() { return 'custom-buildid' },
}`
          )
          const start = next.cliOutput.length
          await next.build().catch(() => {})
          expect(next.cliOutput.slice(start)).toMatch(
            /The key "NODE_ENV" under/
          )
        })

        it('should fail with NEXT_RUNTIME in env key', async () => {
          await next.patchFile(
            'next.config.js',
            `module.exports = {
  env: { NEXT_RUNTIME: 'nodejs' },
  onDemandEntries: { maxInactiveAge: 1000 * 60 * 60 },
  async generateBuildId() { return 'custom-buildid' },
}`
          )
          const start = next.cliOutput.length
          await next.build().catch(() => {})
          expect(next.cliOutput.slice(start)).toMatch(
            /The key "NEXT_RUNTIME" under/
          )
        })

        it('should allow __ within env key', async () => {
          await next.patchFile(
            'next.config.js',
            `module.exports = {
  env: { SOME__ENV__VAR: '123' },
  onDemandEntries: { maxInactiveAge: 1000 * 60 * 60 },
  async generateBuildId() { return 'custom-buildid' },
}`
          )
          const start = next.cliOutput.length
          await next.build().catch(() => {})
          expect(next.cliOutput.slice(start)).not.toMatch(
            /The key "SOME__ENV__VAR" under/
          )
        })
      })
    }
  )
})
