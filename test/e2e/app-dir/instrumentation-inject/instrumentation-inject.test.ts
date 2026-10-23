import { FileRef, nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import path from 'path'

for (const variant of ['root', 'src', 'without-user'] as const) {
  describe(`instrumentationInject ${variant}`, () => {
    const prefix = variant === 'src' ? 'src/' : ''
    const hasUser = variant !== 'without-user'
    const { next } = nextTestSetup({
      files: {
        [`${prefix}app`]: new FileRef(path.join(__dirname, 'app')),
        [`${prefix}pages`]: new FileRef(path.join(__dirname, 'pages')),
        [`${prefix}handler.ts`]: new FileRef(
          path.join(__dirname, 'handler.ts')
        ),
        ...(hasUser
          ? {
              [`${prefix}instrumentation.ts`]: new FileRef(
                path.join(__dirname, 'instrumentation.ts')
              ),
            }
          : {}),
        'next.config.ts': new FileRef(path.join(__dirname, 'next.config.ts')),
        injected: new FileRef(path.join(__dirname, 'injected')),
        pkg: new FileRef(path.join(__dirname, 'pkg')),
      },
      packageJson: variant === 'root' ? { type: 'module' } : {},
      dependencies: {
        'instrumentation-test-package': 'file:./pkg',
      },
    })

    for (const [route, runtime] of [
      ['/node', 'nodejs'],
      ['/edge', 'edge'],
      ['/api/state', 'nodejs'],
    ]) {
      it(`loads modules and awaits registration in order in ${runtime} (${route})`, async () => {
        const response = await next.fetch(route)
        expect(response.status).toBe(200)
        const expected = {
          runtime,
          order:
            'first,package,last' +
            (hasUser ? ',user' : '') +
            ',register:first,register:last' +
            (hasUser ? ',register:user' : ''),
        }
        expect(await response.json()).toEqual(expected)
        // Registration must not run again for a subsequent request.
        expect(await (await next.fetch(route)).json()).toEqual(expected)
      })

      it(`preserves the error response when instrumentation hooks fail in ${runtime} (${route})`, async () => {
        const response = await next.fetch(`${route}?error=1`)
        expect(response.status).toBe(500)
      })

      // Request-time CLI logs are only available when running a local server.
      // The error response and registration assertions above also run on deploy.
      // @force-gate !deploy
      it(`isolates sync and async request-error hook failures in ${runtime} (${route})`, async () => {
        const start = next.cliOutput.length
        const response = await next.fetch(`${route}?error=1`)
        expect(response.status).toBe(500)
        await retry(() => {
          const output = next.cliOutput.slice(start)
          const hooks = [...output.matchAll(/inject-error (first|last|user) /g)]
          expect(hooks.map((match) => match[1])).toEqual([
            'first',
            'last',
            ...(hasUser ? ['user'] : []),
          ])
          expect(output).toContain('first hook failed')
          expect(output).toContain('last hook failed')
          expect(output).toContain(
            `${route}?error=1 route injected request failure`
          )
        })
      })
    }
  })
}
