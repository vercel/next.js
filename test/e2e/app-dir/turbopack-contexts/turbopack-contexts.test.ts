import { nextTestSetup } from 'e2e-utils'

// `experimental.turbopackContexts` is a Turbopack-only feature.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-contexts',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      // Local `file:` dependency (cond-pkg) needs install.
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('applies the inherited context loader rules and resolve conditions only within the context', async () => {
      const response = JSON.parse(await next.render('/api'))
      expect(response).toEqual({
        // Default context: loader rule does not apply, default export condition resolves.
        normalValue: 'untransformed-value',
        normalCond: 'resolved-default-condition',
        // `my-ctx` context: the `*.special.js` loader rule transforms the module, and the
        // `my-cond` resolve condition selects cond-pkg's `my-cond` export.
        contextValue: 'transformed-by-context-loader',
        contextCond: 'resolved-my-cond-condition',
      })
    })
  }
)
