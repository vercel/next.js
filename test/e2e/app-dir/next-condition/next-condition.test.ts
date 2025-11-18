import { FileRef, nextTestSetup } from 'e2e-utils'

describe('`next-js` Condition - Rendering', () => {
  const { next, isTurbopack, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/render',
    // copy shared packages over to the test folder. This will override the symlink that currently
    // exists in the fixture with relative paths
    overrideFiles: {
      'sym-linked-packages': new FileRef(__dirname + '/packages'),
    },
    dependencies: require('./fixtures/render/package.json').dependencies,
    // Deploy tests are broken with `config.serverExternalPackages`
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // TODO I should be able to access the complete config from a Next.js Server or Build
  // So I don't have to coordinate using process env variables
  const isUsingCacheComponents = process.env.__NEXT_CACHE_COMPONENTS === 'true'

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  if (isUsingCacheComponents) {
    describe('When Cache Components is enabled', () => {
      it('should follow the next-js condition from a bundled commonjs package', async () => {
        const $ = await next.render$('/cjs')

        const text = formatHtmlText($('main').html())
        if (isTurbopack) {
          expect(text).toMatchInlineSnapshot(`
           "  Server
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"},"named":"EXPORTS NEXT SERVER - Named Export"}
                 named:
                 "EXPORTS NEXT SERVER - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"},"named":"EXPORTS NEXT SERVER - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"},"named":"IMPORTS NEXT SERVER - Named Export"}
                 named:
                 "IMPORTS NEXT SERVER - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"},"named":"IMPORTS NEXT SERVER - Named Export"}
             Client
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"},"named":"EXPORTS NEXT CLIENT - Named Export"}
                 named:
                 "EXPORTS NEXT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"},"named":"EXPORTS NEXT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"},"named":"IMPORTS NEXT CLIENT - Named Export"}
                 named:
                 "IMPORTS NEXT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"},"named":"IMPORTS NEXT CLIENT - Named Export"}"
          `)
        } else {
          expect(text).toMatchInlineSnapshot(`
           "  Server
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"}
                 Namespace:
                 {"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"}
                 named:
                 "EXPORTS NEXT SERVER - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"},"named":"EXPORTS NEXT SERVER - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"}
                 Namespace:
                 {"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"}
                 named:
                 "IMPORTS NEXT SERVER - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"},"named":"IMPORTS NEXT SERVER - Named Export"}
             Client
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"}
                 Namespace:
                 {"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"}
                 named:
                 "EXPORTS NEXT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"},"named":"EXPORTS NEXT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"}
                 Namespace:
                 {"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"}
                 named:
                 "IMPORTS NEXT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"},"named":"IMPORTS NEXT CLIENT - Named Export"}"
          `)
        }
      })
      it('should follow the next-js condition from a bundled esm package', async () => {
        const $ = await next.render$('/esm')

        const text = formatHtmlText($('main').html())
        expect(text).toMatchInlineSnapshot(`
         "  Server
             Exports
               Static
               Default:
               "EXPORTS NEXT SERVER - Default Export"
               Namespace:
               {"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"}
               named:
               "EXPORTS NEXT SERVER - Named Export"
               Dynamic
               {"default":"EXPORTS NEXT SERVER - Default Export","named":"EXPORTS NEXT SERVER - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS NEXT SERVER - Default Export"
               Namespace:
               {"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"}
               named:
               "IMPORTS NEXT SERVER - Named Export"
               Dynamic
               {"default":"IMPORTS NEXT SERVER - Default Export","named":"IMPORTS NEXT SERVER - Named Export"}
           Client
             Exports
               Static
               Default:
               "EXPORTS NEXT CLIENT - Default Export"
               Namespace:
               {"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"}
               named:
               "EXPORTS NEXT CLIENT - Named Export"
               Dynamic
               {"default":"EXPORTS NEXT CLIENT - Default Export","named":"EXPORTS NEXT CLIENT - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS NEXT CLIENT - Default Export"
               Namespace:
               {"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"}
               named:
               "IMPORTS NEXT CLIENT - Named Export"
               Dynamic
               {"default":"IMPORTS NEXT CLIENT - Default Export","named":"IMPORTS NEXT CLIENT - Named Export"}"
        `)
      })
      /**
       * We actually want this condition to be followed even for externals but it is tricky to ensure
       * we are running Node.js with the appropriate condition since the right condition depends on information
       * we derive while running Node.js. We will follow up with a change that enables the condition
       * for externals as well but for now we assert the current behavior.
       */
      it('should not follow the next-js condition from an external commonjs package', async () => {
        const $ = await next.render$('/external-cjs')

        const text = formatHtmlText($('main').html())
        if (isTurbopack) {
          expect(text).toMatchInlineSnapshot(`
           "  Server
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
             Client
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}"
          `)
        } else {
          expect(text).toMatchInlineSnapshot(`
           "  Server
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
             Client
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}"
          `)
        }
      })
      /**
       * We actually want this condition to be followed even for externals but it is tricky to ensure
       * we are running Node.js with the appropriate condition since the right condition depends on information
       * we derive while running Node.js. We will follow up with a change that enables the condition
       * for externals as well but for now we assert the current behavior.
       */
      it('should follow the next-js condition from an external esm package', async () => {
        const $ = await next.render$('/external-esm')

        const text = formatHtmlText($('main').html())
        expect(text).toMatchInlineSnapshot(`
         "  Server
             Exports
               Static
               Default:
               "EXPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
               named:
               "EXPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
               named:
               "IMPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
           Client
             Exports
               Static
               Default:
               "EXPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
               named:
               "EXPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
               named:
               "IMPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}"
        `)
      })
    })
  } else {
    describe('When Cache Components is disabled', () => {
      it('should not follow the next-js condition from a bundled commonjs package', async () => {
        const $ = await next.render$('/cjs')

        const text = formatHtmlText($('main').html())
        if (isTurbopack) {
          expect(text).toMatchInlineSnapshot(`
           "  Server
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"},"named":"EXPORTS DEFAULT SERVER - Named Export"}
                 named:
                 "EXPORTS DEFAULT SERVER - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"},"named":"EXPORTS DEFAULT SERVER - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"},"named":"IMPORTS DEFAULT SERVER - Named Export"}
                 named:
                 "IMPORTS DEFAULT SERVER - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"},"named":"IMPORTS DEFAULT SERVER - Named Export"}
             Client
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}"
          `)
        } else {
          expect(text).toMatchInlineSnapshot(`
                    "  Server
                        Exports
                          Static
                          Default:
                          {"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"}
                          Namespace:
                          {"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"}
                          named:
                          "EXPORTS DEFAULT SERVER - Named Export"
                          Dynamic
                          {"default":{"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"},"named":"EXPORTS DEFAULT SERVER - Named Export"}
                        Imports
                          Static
                          Default:
                          {"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"}
                          Namespace:
                          {"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"}
                          named:
                          "IMPORTS DEFAULT SERVER - Named Export"
                          Dynamic
                          {"default":{"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"},"named":"IMPORTS DEFAULT SERVER - Named Export"}
                      Client
                        Exports
                          Static
                          Default:
                          {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                          Namespace:
                          {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                          named:
                          "EXPORTS DEFAULT CLIENT - Named Export"
                          Dynamic
                          {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                        Imports
                          Static
                          Default:
                          {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                          Namespace:
                          {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                          named:
                          "IMPORTS DEFAULT CLIENT - Named Export"
                          Dynamic
                          {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}"
                  `)
        }
      })
      it('should not follow the next-js condition from a bundled esm package', async () => {
        const $ = await next.render$('/esm')

        const text = formatHtmlText($('main').html())
        expect(text).toMatchInlineSnapshot(`
         "  Server
             Exports
               Static
               Default:
               "EXPORTS DEFAULT SERVER - Default Export"
               Namespace:
               {"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"}
               named:
               "EXPORTS DEFAULT SERVER - Named Export"
               Dynamic
               {"default":"EXPORTS DEFAULT SERVER - Default Export","named":"EXPORTS DEFAULT SERVER - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS DEFAULT SERVER - Default Export"
               Namespace:
               {"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"}
               named:
               "IMPORTS DEFAULT SERVER - Named Export"
               Dynamic
               {"default":"IMPORTS DEFAULT SERVER - Default Export","named":"IMPORTS DEFAULT SERVER - Named Export"}
           Client
             Exports
               Static
               Default:
               "EXPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
               named:
               "EXPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
               named:
               "IMPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}"
        `)
      })
      it('should not follow the next-js condition from an external commonjs package', async () => {
        const $ = await next.render$('/external-cjs')

        const text = formatHtmlText($('main').html())
        if (isTurbopack) {
          expect(text).toMatchInlineSnapshot(`
           "  Server
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
             Client
               Exports
                 Static
                 Default:
                 {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "EXPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
               Imports
                 Static
                 Default:
                 {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 Namespace:
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
                 named:
                 "IMPORTS DEFAULT CLIENT - Named Export"
                 Dynamic
                 {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}"
          `)
        } else {
          expect(text).toMatchInlineSnapshot(`
                    "  Server
                        Exports
                          Static
                          Default:
                          {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                          Namespace:
                          {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                          named:
                          "EXPORTS DEFAULT CLIENT - Named Export"
                          Dynamic
                          {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                        Imports
                          Static
                          Default:
                          {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                          Namespace:
                          {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                          named:
                          "IMPORTS DEFAULT CLIENT - Named Export"
                          Dynamic
                          {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}
                      Client
                        Exports
                          Static
                          Default:
                          {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                          Namespace:
                          {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
                          named:
                          "EXPORTS DEFAULT CLIENT - Named Export"
                          Dynamic
                          {"default":{"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"},"named":"EXPORTS DEFAULT CLIENT - Named Export"}
                        Imports
                          Static
                          Default:
                          {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                          Namespace:
                          {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
                          named:
                          "IMPORTS DEFAULT CLIENT - Named Export"
                          Dynamic
                          {"default":{"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"},"named":"IMPORTS DEFAULT CLIENT - Named Export"}"
                  `)
        }
      })
      it('should not follow the next-js condition from an external esm package', async () => {
        const $ = await next.render$('/external-esm')

        const text = formatHtmlText($('main').html())
        expect(text).toMatchInlineSnapshot(`
         "  Server
             Exports
               Static
               Default:
               "EXPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
               named:
               "EXPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
               named:
               "IMPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
           Client
             Exports
               Static
               Default:
               "EXPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
               named:
               "EXPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"EXPORTS DEFAULT CLIENT - Default Export","named":"EXPORTS DEFAULT CLIENT - Named Export"}
             Imports
               Static
               Default:
               "IMPORTS DEFAULT CLIENT - Default Export"
               Namespace:
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}
               named:
               "IMPORTS DEFAULT CLIENT - Named Export"
               Dynamic
               {"default":"IMPORTS DEFAULT CLIENT - Default Export","named":"IMPORTS DEFAULT CLIENT - Named Export"}"
        `)
      })
    })
  }
})

describe('`next-js` Condition - middleware (legacy)', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/middleware',
    // copy shared packages over to the test folder. This will override the symlink that currently
    // exists in the fixture with relative paths
    overrideFiles: {
      'sym-linked-packages': new FileRef(__dirname + '/packages'),
    },
    dependencies: require('./fixtures/middleware/package.json').dependencies,
    // Deploy tests are broken with `config.serverExternalPackages`
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  describe('With or Without Cache Components', () => {
    it('should follow the next-js condition from a bundled commonjs package', async () => {
      let cliIndex = next.cliOutput.length
      const $ = await next.render$('/')

      const middlewareOutput = formatMiddlewareOutput(
        next.cliOutput.slice(cliIndex)
      )
      expect(middlewareOutput).toMatchInlineSnapshot(`
       "CJSExportsDefault: {
         default: 'EXPORTS DEFAULT SERVER - Default Export',
         named: 'EXPORTS DEFAULT SERVER - Named Export'
       }
       ExternalCJSExportsDefault: {
         default: 'EXPORTS DEFAULT SERVER - Default Export',
         named: 'EXPORTS DEFAULT SERVER - Named Export'
       }
       ESMExportsDefault: EXPORTS DEFAULT SERVER - Default Export
       ExternalESMExportsDefault: EXPORTS DEFAULT SERVER - Default Export"
      `)

      const text = formatHtmlText($('main').html())
      expect(text).toMatchInlineSnapshot(`"Hello World"`)
    })
  })
})

describe('`next-js` Condition - proxy', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/proxy',
    // copy shared packages over to the test folder. This will override the symlink that currently
    // exists in the fixture with relative paths
    overrideFiles: {
      'sym-linked-packages': new FileRef(__dirname + '/packages'),
    },
    dependencies: require('./fixtures/proxy/package.json').dependencies,
    // Deploy tests are broken with `config.serverExternalPackages`
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  describe('With or Without Cache Components', () => {
    it('should follow the next-js condition from a bundled commonjs package', async () => {
      let cliIndex = next.cliOutput.length
      const $ = await next.render$('/')

      const middlewareOutput = formatMiddlewareOutput(
        next.cliOutput.slice(cliIndex)
      )
      expect(middlewareOutput).toMatchInlineSnapshot(`
         "CJSExportsDefault: {
           default: 'EXPORTS DEFAULT SERVER - Default Export',
           named: 'EXPORTS DEFAULT SERVER - Named Export'
         }
         ExternalCJSExportsDefault: {
           default: 'EXPORTS DEFAULT CLIENT - Default Export',
           named: 'EXPORTS DEFAULT CLIENT - Named Export'
         }
         ESMExportsDefault: EXPORTS DEFAULT SERVER - Default Export
         ExternalESMExportsDefault: EXPORTS DEFAULT CLIENT - Default Export"
        `)

      const text = formatHtmlText($('main').html())
      expect(text).toMatchInlineSnapshot(`"Hello World"`)
    })
  })
})

describe('`next-js` Condition - instrumentation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname + '/fixtures/instrumentation',
    // copy shared packages over to the test folder. This will override the symlink that currently
    // exists in the fixture with relative paths
    overrideFiles: {
      'sym-linked-packages': new FileRef(__dirname + '/packages'),
    },
    dependencies: require('./fixtures/instrumentation/package.json')
      .dependencies,
    // Deploy tests are broken with `config.serverExternalPackages`
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // Recommended for tests that check HTML. Cheerio is a HTML parser that has a jQuery like API.
  describe('With or Without Cache Components', () => {
    it('should not follow the next-js condition inside instrumentation', async () => {
      // We need a request to trigger the server start in start tests
      await next.render$('/')
      const registerOutput = formatRegisterOutput(next.cliOutput)
      expect(registerOutput).toMatchInlineSnapshot(`
         "CJSExportsDefault: {
           default: 'EXPORTS DEFAULT SERVER - Default Export',
           named: 'EXPORTS DEFAULT SERVER - Named Export'
         }
         ExternalCJSExportsDefault: {
           default: 'EXPORTS DEFAULT CLIENT - Default Export',
           named: 'EXPORTS DEFAULT CLIENT - Named Export'
         }
         ESMExportsDefault: EXPORTS DEFAULT SERVER - Default Export
         ExternalESMExportsDefault: EXPORTS DEFAULT CLIENT - Default Export"
        `)
    })
  })
})

/**
 * produces more readable snapshots by stripping tags and auto formatting
 */
function formatHtmlText(html) {
  let depth = 0
  return html
    .replace(/<!--[\s\S]*?-->/g, '') // strip comments
    .replace(/>\s*</g, '><')
    .replace(/</g, '\n<')
    .split('\n')
    .map((line) => {
      if (/^<\//.test(line)) depth--
      let txt = line.replace(/<[^>]+>/g, '').trim()
      if (txt) {
        txt = txt
          .replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
      }
      const out = txt ? '  '.repeat(Math.max(depth, 0)) + txt : ''
      if (/^<[^/!][^>]*[^/]?>/.test(line)) depth++
      return out
    })
    .filter(Boolean)
    .join('\n')
}

function formatMiddlewareOutput(cliOutput) {
  return (
    cliOutput.match(
      /==== MIDDLEWARE START ====(.*?)==== MIDDLEWARE END ====/s
    )?.[1] ?? ''
  ).trim()
}

function formatRegisterOutput(cliOutput) {
  return (
    cliOutput.match(
      /==== REGISTER START ====(.*?)==== REGISTER END ====/s
    )?.[1] ?? ''
  ).trim()
}
