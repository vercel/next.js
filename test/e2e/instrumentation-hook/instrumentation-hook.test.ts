import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'
import path from 'path'

const describeCase = (
  caseName: string,
  callback: (context: ReturnType<typeof nextTestSetup>) => void,
  { skipDeployment = false }: { skipDeployment?: boolean } = {}
) => {
  describe(caseName, () => {
    const context = nextTestSetup({
      files: path.join(__dirname, caseName),
      skipDeployment,
    })
    if (context.skipped) return

    callback(context)
  })
}
describe('Instrumentation Hook', () => {
  describeCase('with-esm-import', ({ next }) => {
    it('with-esm-import should run the instrumentation hook', async () => {
      const result = await next.render('/')
      expect(result).toContain('Page instrumentationFinished=nodejs')
    })
  })

  describeCase('with-middleware', ({ next }) => {
    it('with-middleware should run the instrumentation hook', async () => {
      const result = await next.fetch('/')
      expect(result.headers.get('My-Custom-Header')).toBe(
        'instrumentationFinished=edge'
      )
      expect(await result.text()).toContain(
        'Page Node instrumentationFinished=nodejs'
      )
    })
  })

  describeCase('with-node-middleware', ({ next }) => {
    it('with-node-middleware should run the instrumentation hook', async () => {
      const result = await next.fetch('/')
      expect(result.headers.get('My-Custom-Header')).toBe(
        'instrumentationFinished=nodejs'
      )
      expect(await result.text()).toContain(
        'Page Node instrumentationFinished=nodejs'
      )
    })
  })

  describeCase('with-edge-api', ({ next }) => {
    it('with-edge-api should run the instrumentation hook', async () => {
      const result = await next.render('/api')
      expect(result).toContain('API Edge instrumentationFinished=edge')
    })
  })

  describeCase('with-edge-page', ({ next }) => {
    it('with-edge-page should run the instrumentation hook', async () => {
      const result = await next.render('/')
      expect(result).toContain('Page Edge instrumentationFinished=edge')
    })
  })

  describeCase('with-node-api', ({ next }) => {
    it('with-node-api should run the instrumentation hook', async () => {
      const result = await next.render('/api')
      expect(result).toContain('API Node instrumentationFinished=nodejs')
    })
  })

  describeCase('with-node-page', ({ next }) => {
    it('with-node-page should run the instrumentation hook', async () => {
      const result = await next.render('/')
      expect(result).toContain('Page Node instrumentationFinished=nodejs')
    })
  })

  describeCase('with-async-node-page', ({ next }) => {
    it('with-async-node-page should run the instrumentation hook', async () => {
      const result = await next.render('/')
      expect(result).toContain('Page Node instrumentationFinished=nodejs')
    })
  })

  describeCase('with-async-edge-page', ({ next }) => {
    it('with-async-edge-page should run the instrumentation hook', async () => {
      const result = await next.render('/')
      expect(result).toContain('Page Edge instrumentationFinished=edge')
    })
  })

  describeCase('with-async-node-app-route', ({ next }) => {
    it('with-async-node-app-route should run the instrumentation hook before the app-route handler', async () => {
      const result = await next.render('/api/check')
      expect(result).toContain('API Node instrumentationFinished=nodejs')
    })
  })

  describeCase('general', ({ next, isNextDev }) => {
    it('should not overlap with a instrumentation page', async () => {
      const page = await next.render('/instrumentation')
      expect(page).toContain('Hello')
    })
    if (isNextDev) {
      // TODO: Implement handling for changing the instrument file.
      it.skip('should reload the server when the instrumentation hook changes', async () => {
        await next.render('/')
        await next.patchFile(
          './instrumentation.js',
          `export function register() {console.log('toast')}`
        )
        await check(() => next.cliOutput, /toast/)
        await next.renameFile(
          './instrumentation.js',
          './instrumentation.js.bak'
        )
        await check(
          () => next.cliOutput,
          /The instrumentation file has been removed/
        )
        await next.patchFile(
          './instrumentation.js.bak',
          `export function register() {console.log('bread')}`
        )
        await next.renameFile(
          './instrumentation.js.bak',
          './instrumentation.js'
        )
        await check(() => next.cliOutput, /The instrumentation file was added/)
        await check(() => next.cliOutput, /bread/)
      })
    }
  })
})
