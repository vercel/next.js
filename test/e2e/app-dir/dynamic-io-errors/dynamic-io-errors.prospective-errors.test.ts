import { nextTestSetup } from 'e2e-utils'

const isTurbopack = !!process.env.TURBOPACK

describe(`Dynamic IO Prospective Render Errors - Debug Build`, () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/prospective-render-errors',
    env: { NEXT_DEBUG_BUILD: 'true' },
    // Accessing cliOutput is only available on the deployment
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    // In next dev there really isn't a prospective render but we still assert we error on the first visit to each page
    it('should error on the first visit to each page', async () => {
      let res

      res = await next.fetch('/error')
      expect(res.status).toBe(500)
      res = await next.fetch('/error')
      expect(res.status).toBe(200)
      res = await next.fetch('/error')
      expect(res.status).toBe(200)

      res = await next.fetch('/routes/error')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/error')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/error')
      expect(res.status).toBe(200)

      res = await next.fetch('/null')
      expect(res.status).toBe(500)
      res = await next.fetch('/null')
      expect(res.status).toBe(200)
      res = await next.fetch('/null')
      expect(res.status).toBe(200)

      // To make disambiguating cli output in the prod tests I switch from null to undefined
      // for the routes version of this tests. really we're just asserting we get a coherent message
      // when the thrown value is not a string or Error so null or undefined is not very important itself
      res = await next.fetch('/routes/undefined')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/undefined')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/undefined')
      expect(res.status).toBe(200)

      res = await next.fetch('/object')
      expect(res.status).toBe(500)
      res = await next.fetch('/object')
      expect(res.status).toBe(200)
      res = await next.fetch('/object')
      expect(res.status).toBe(200)

      res = await next.fetch('/routes/object')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/object')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/object')
      expect(res.status).toBe(200)

      res = await next.fetch('/string')
      expect(res.status).toBe(500)
      res = await next.fetch('/string')
      expect(res.status).toBe(200)
      res = await next.fetch('/string')
      expect(res.status).toBe(200)

      res = await next.fetch('/routes/string')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/string')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/string')
      expect(res.status).toBe(200)
    })
  } else {
    it('should log an error when the prospective render errors with an Error in a Page', async () => {
      expect(next.cliOutput).toContain(
        'Error: Route /error errored during the prospective render.'
      )
      expect(next.cliOutput).toContain('Original Error: BOOM (Error)')
      if (!isTurbopack) {
        // In turbopack we don't yet support disabling minification so this assertion won't work
        expect(next.cliOutput).toContain('at ErrorFirstTime')
      }
    })

    it('should log an error when the prospective render errors with a string in a Page', async () => {
      expect(next.cliOutput).toContain(
        'Route /string errored during the prospective render.'
      )
      expect(next.cliOutput).toContain('Original Message: BOOM (string)')
    })

    it('should log an error when the prospective render errors with null in a Page', async () => {
      expect(next.cliOutput).toContain(
        'Route /null errored during the prospective render.'
      )
      expect(next.cliOutput).toContain('\nnull\n')
    })

    it('should log an error when the prospective render errors with an object in a Page', async () => {
      expect(next.cliOutput).toContain(
        'Route /object errored during the prospective render.'
      )
      expect(next.cliOutput).toContain("{ boom: '(Object)' }")
    })

    it('should log an error when the prospective render errors with an Error in a route', async () => {
      expect(next.cliOutput).toContain(
        'Error: Route /routes/error errored during the prospective render.'
      )
      expect(next.cliOutput).toContain('Original Error: BOOM (Error route)')
      if (!isTurbopack) {
        // In turbopack we don't yet support disabling minification so this assertion won't work
        expect(next.cliOutput).toContain('at errorFirstTime')
      }
    })

    it('should log an error when the prospective render errors with a string in a route', async () => {
      expect(next.cliOutput).toContain(
        'Route /routes/string errored during the prospective render.'
      )
      expect(next.cliOutput).toContain('Original Message: BOOM (string route)')
    })

    it('should log an error when the prospective render errors with undefined in a route', async () => {
      expect(next.cliOutput).toContain(
        'Route /routes/undefined errored during the prospective render.'
      )
      expect(next.cliOutput).toContain('\nundefined\n')
    })

    it('should log an error when the prospective render errors with an object in a route', async () => {
      expect(next.cliOutput).toContain(
        'Route /routes/object errored during the prospective render.'
      )
      expect(next.cliOutput).toContain("{ boom: '(Object route)' }")
    })
  }
})

describe(`Dynamic IO Prospective Render Errors - Standard Build`, () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/prospective-render-errors',
  })

  if (skipped) {
    return
  }

  if (isNextDev) {
    // In next dev there really isn't a prospective render but we still assert we error on the first visit to each page
    it('should error on the first visit to each page', async () => {
      let res

      res = await next.fetch('/error')
      expect(res.status).toBe(500)
      res = await next.fetch('/error')
      expect(res.status).toBe(200)
      res = await next.fetch('/error')
      expect(res.status).toBe(200)

      res = await next.fetch('/routes/error')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/error')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/error')
      expect(res.status).toBe(200)

      res = await next.fetch('/null')
      expect(res.status).toBe(500)
      res = await next.fetch('/null')
      expect(res.status).toBe(200)
      res = await next.fetch('/null')
      expect(res.status).toBe(200)

      // To make disambiguating cli output in the prod tests I switch from null to undefined
      // for the routes version of this tests. really we're just asserting we get a coherent message
      // when the thrown value is not a string or Error so null or undefined is not very important itself
      res = await next.fetch('/routes/undefined')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/undefined')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/undefined')
      expect(res.status).toBe(200)

      res = await next.fetch('/object')
      expect(res.status).toBe(500)
      res = await next.fetch('/object')
      expect(res.status).toBe(200)
      res = await next.fetch('/object')
      expect(res.status).toBe(200)

      res = await next.fetch('/routes/object')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/object')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/object')
      expect(res.status).toBe(200)

      res = await next.fetch('/string')
      expect(res.status).toBe(500)
      res = await next.fetch('/string')
      expect(res.status).toBe(200)
      res = await next.fetch('/string')
      expect(res.status).toBe(200)

      res = await next.fetch('/routes/string')
      expect(res.status).toBe(500)
      res = await next.fetch('/routes/string')
      expect(res.status).toBe(200)
      res = await next.fetch('/routes/string')
      expect(res.status).toBe(200)
    })
  } else {
    it('should not log an error when the prospective render errors with an Error in a Page', async () => {
      expect(next.cliOutput).not.toContain(
        'Error: Route /error errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain('Original Error: BOOM (Error)')
      expect(next.cliOutput).not.toContain('at ErrorFirstTime')
    })

    it('should not log an error when the prospective render errors with a string in a Page', async () => {
      expect(next.cliOutput).not.toContain(
        'Route /string errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain('Original Message: BOOM (string)')
    })

    it('should not log an error when the prospective render errors with null in a Page', async () => {
      expect(next.cliOutput).not.toContain(
        'Route /null errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain('\nnull\n')
    })

    it('should not log an error when the prospective render errors with an object in a Page', async () => {
      expect(next.cliOutput).not.toContain(
        'Route /object errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain("{ boom: '(Object)' }")
    })

    it('should not log an error when the prospective render errors with an Error in a route', async () => {
      expect(next.cliOutput).not.toContain(
        'Error: Route /routes/error errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain('Original Error: BOOM (Error route)')
      expect(next.cliOutput).not.toContain('at errorFirstTime')
    })

    it('should not log an error when the prospective render errors with a string in a route', async () => {
      expect(next.cliOutput).not.toContain(
        'Route /routes/string errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain(
        'Original Message: BOOM (string route)'
      )
    })

    it('should not log an error when the prospective render errors with undefined in a route', async () => {
      expect(next.cliOutput).not.toContain(
        'Route /routes/undefined errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain('\nundefined\n')
    })

    it('should not log an error when the prospective render errors with an object in a route', async () => {
      expect(next.cliOutput).not.toContain(
        'Route /routes/object errored during the prospective render.'
      )
      expect(next.cliOutput).not.toContain("{ boom: '(Object route)' }")
    })
  }
})
