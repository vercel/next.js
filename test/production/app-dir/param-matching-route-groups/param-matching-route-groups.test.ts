import { FileRef, nextTestSetup } from 'e2e-utils'
import { join } from 'node:path'

describe.each(['aligned', 'grouped-sidebar', 'grouped-children'])(
  'param-matching parallel route order: %s',
  (fixture) => {
    const { next } = nextTestSetup({
      files: {
        app: new FileRef(join(__dirname, 'fixtures', fixture)),
        'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
      },
      skipStart: true,
    })

    it('uses URL parameter order regardless of the depth of a parallel branch', async () => {
      const { exitCode, cliOutput } = await next.build()
      expect(cliOutput).not.toContain('must be ordered')
      expect(exitCode).toBe(0)
      await next.start({ skipBuild: true })

      for (const pathname of ['/t1/b1', '/t2/b2']) {
        const $ = await next.render$(pathname)
        expect($('#main-page').text()).toBe('Main page')
        expect($('#sidebar-page').text()).toBe('Sidebar page')
      }
    })
  }
)

describe.each([
  ['incompatible', 'blocking'],
  ['inherited-not-found', 'not-found'],
])('param-matching incoherent composition: %s', (fixture, bottomMode) => {
  const { next } = nextTestSetup({
    files: {
      app: new FileRef(join(__dirname, 'fixtures', fixture)),
      'next.config.ts': new FileRef(join(__dirname, 'next.config.ts')),
    },
    skipStart: true,
  })

  it('rejects policies that become incoherent through composition', async () => {
    const { exitCode, cliOutput } = await next.build()
    expect(exitCode).toBe(1)
    expect(cliOutput).toContain(
      `parameter "bottom" uses "${bottomMode}" after parameter "top" uses a later matching phase`
    )
  })
})
