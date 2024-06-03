import { nextTestSetup } from 'e2e-utils'

// TODO: support react-server condition for instrumentation hook in turbopack
;(process.env.TURBOPACK ? describe.skip : describe)(
  'rsc layers transform',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('should render installed react-server condition for middleware', async () => {
      const json = await next.fetch('/middleware').then((res) => res.json())

      expect(json).toEqual({
        textValue: 'text-value',
        clientReference: 'Symbol(react.client.reference)',
      })
    })

    it('should call instrumentation hook without errors', async () => {
      const output = next.cliOutput
      expect(output).toContain('instrumentation:register')
      expect(output).toContain('instrumentation:text:text-value')
    })

    it('should not warn on the process.emit usage from react.react-server bundle', async () => {
      // For edge runtime it will produce if we didn't strip process.emit from the code properly
      // node_modules/.pnpm/react@19.0.0-rc-f994737d14-20240522/node_modules/react/cjs/react.production.js
      // A Node.js API is used (process.emit at line: 311) which is not supported in the Edge Runtime.
      // Learn more: https://nextjs.org/docs/api-reference/edge-runtime
      expect(next.cliOutput).not.toContain(
        `A Node.js API is used (process.emit`
      )
    })
  }
)
