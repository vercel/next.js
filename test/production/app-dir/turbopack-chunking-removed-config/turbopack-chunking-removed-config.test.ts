import { nextTestSetup } from 'e2e-utils'

describe('experimental.turbopackChunking removed/renamed config', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('errors when the removed `turbopackGenerateComponentChunks` flag is used', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: { turbopackGenerateComponentChunks: true },
      }`
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain(
      '`experimental.turbopackGenerateComponentChunks` has been moved to `experimental.turbopackChunking.generateComponentChunks`'
    )
  })

  it('errors when the renamed `turbopackChunkingHeuristics` key is used', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: { turbopackChunkingHeuristics: { requestCost: 100000 } },
      }`
    )
    const { cliOutput } = await next.build()
    expect(cliOutput).toContain(
      '`experimental.turbopackChunkingHeuristics` has been renamed to `experimental.turbopackChunking`'
    )
  })

  it('accepts a valid `turbopackChunking` config', async () => {
    await next.patchFile(
      'next.config.js',
      `module.exports = {
        experimental: { turbopackChunking: { maxMergeChunkSize: 100000 } },
      }`
    )
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(0)
    expect(cliOutput).not.toContain('has been moved to')
    expect(cliOutput).not.toContain('has been renamed to')
  })
})
