import { nextTestSetup } from 'e2e-utils'
import {
  getActionsRoutesStateByRuntime,
  markLayoutAsEdge,
} from '../_testing/utils'
import { retry } from 'next-test-utils'

describe('actions-tree-shaking - reexport', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (process.env.TEST_EDGE) {
    markLayoutAsEdge(next)
  }

  it('should not tree-shake namespace exports the manifest', async () => {
    const actionsRoutesState = await getActionsRoutesStateByRuntime(next)

    expect(actionsRoutesState).toMatchObject({
      'app/namespace-reexport/server/page': {
        rsc: 3,
      },
      'app/namespace-reexport/client/page': {
        'action-browser': 3,
      },
      'app/named-reexport/server/page': {
        rsc: 3,
      },
      'app/namespace-reexport-2/client/page': {
        'action-browser': 3,
      },
      'app/namespace-reexport-2/server/page': {
        rsc: 3,
      },
    })
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
})
