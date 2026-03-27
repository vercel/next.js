import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import fs from 'fs'
import path from 'path'

describe('instrumentation-client-external-dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    skipStart: true,
  })

  beforeAll(async () => {
    // Create the external package directory outside the project root
    // to simulate a monorepo sibling package with TypeScript files
    const externalDir = path.join(next.testDir, '..', 'external-package')
    await fs.promises.mkdir(externalDir, { recursive: true })
    await fs.promises.writeFile(
      path.join(externalDir, 'utils.ts'),
      `
interface InitOptions {
  debug: boolean
}

export function initClient(options: InitOptions): string {
  const message: string = options.debug
    ? 'external-package-init-debug'
    : 'external-package-init'
  return message
}
`
    )
    await next.start()
  })

  it('should transpile TypeScript files imported from outside the project root in instrumentation-client', async () => {
    const browser = await next.browser('/')

    await retry(async () => {
      const result = await browser.elementById('result').text()
      expect(result).toBe('external-package-init-debug')
    })
  })
})
