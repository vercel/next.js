import {
  nextTestSetupActionTreeShaking,
  getActionsRoutesStateByRuntime,
} from '../_testing/utils'
import { retry } from 'next-test-utils'

// TODO: revisit when we have a better side-effect free transform approach for server action
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'actions-tree-shaking - reexport',
  () => {
    const { next } = nextTestSetupActionTreeShaking({
      files: __dirname,
    })

    it('should not tree-shake namespace exports the manifest', async () => {
      const actionsRoutesState = await getActionsRoutesStateByRuntime(next)

      expect(actionsRoutesState).toMatchInlineSnapshot(`
       {
         "app/named-reexport/client/page": [
           "app/named-reexport/client/actions.js#sharedClientLayerAction",
         ],
         "app/named-reexport/server/page": [
           "app/named-reexport/server/actions.js#sharedServerLayerAction",
           "app/named-reexport/server/actions.js#unusedServerLayerAction1",
           "app/named-reexport/server/actions.js#unusedServerLayerAction2",
         ],
         "app/namespace-reexport-2/client/page": [
           "app/namespace-reexport-2/actions/action-modules.js#action",
           "app/namespace-reexport-2/nested.js#getFoo",
         ],
         "app/namespace-reexport-2/server/page": [
           "app/namespace-reexport-2/actions/action-modules.js#action",
           "app/namespace-reexport-2/nested.js#foo",
           "app/namespace-reexport-2/nested.js#getFoo",
         ],
         "app/namespace-reexport/client/page": [
           "app/namespace-reexport/client/actions.js#sharedClientLayerAction",
         ],
         "app/namespace-reexport/server/page": [
           "app/namespace-reexport/server/actions.js#sharedServerLayerAction",
           "app/namespace-reexport/server/actions.js#unusedServerLayerAction1",
           "app/namespace-reexport/server/actions.js#unusedServerLayerAction2",
         ],
       }
      `)
    })

    it('should keep all the action exports for namespace export case on client layer', async () => {
      const browser = await next.browser('/namespace-reexport-2/client')
      const outputSize = next.cliOutput.length

      await browser.elementByCss('#test-1').click()
      await retry(async () => {
        const output = next.cliOutput.slice(outputSize)
        expect(output).toContain('action: test-1')
      })

      await browser.elementByCss('#test-2').click()
      await retry(async () => {
        const output = next.cliOutput.slice(outputSize)
        expect(output).toContain('action: test-2')
      })
    })

    it('should keep all the action exports for namespace export case on server layer', async () => {
      const outputSize = next.cliOutput.length
      await next.browser('/namespace-reexport-2/server')

      await retry(async () => {
        const output = next.cliOutput.slice(outputSize)
        expect(output).toContain('action: test-1')
        expect(output).toContain('action: test-2')
      })
    })
  }
)
