/* eslint-env jest */

const loader = require('next/dist/build/webpack/loaders/next-babel-loader')
const os = require('os')

const babel = async (
  code,
  {
    isServer = false,
    resourcePath = 'index.js',
    hasModern = false,
    development = false,
  } = {}
) => {
  let isAsync = false
  return new Promise((resolve, reject) => {
    function callback(err, content) {
      if (err) {
        reject(err)
      } else {
        resolve(content)
      }
    }

    const res = loader.bind({
      resourcePath,
      async() {
        isAsync = true
        return callback
      },
      callback,
      query: {
        // babel opts
        babelrc: false,
        configFile: false,
        sourceType: 'module',
        compact: true,
        caller: {
          name: 'tests',
          supportsStaticESM: true,
        },
        // loader opts
        cwd: os.tmpdir(),
        isServer,
        distDir: os.tmpdir(),
        pagesDir: os.tmpdir(),
        cache: false,
        babelPresetPlugins: [],
        hasModern,
        development,
      },
    })(code, null)

    if (!isAsync) {
      resolve(res)
    }
  })
}

describe('next-babel-loader', () => {
  describe('replace constants', () => {
    it('should replace typeof window expression nested', async () => {
      const code = await babel('function a(){console.log(typeof window)}')
      expect(code).toMatchInlineSnapshot(
        `"function a(){console.log(\\"object\\");}"`
      )
    })

    it('should replace typeof window expression top level (client)', async () => {
      const code = await babel('typeof window;')
      expect(code).toMatchInlineSnapshot(`"\\"object\\";"`)
    })

    it('should replace typeof window expression top level (server)', async () => {
      const code = await babel('typeof window;', { isServer: true })
      expect(code).toMatchInlineSnapshot(`"\\"undefined\\";"`)
    })

    it('should replace typeof window expression nested', async () => {
      const code = await babel(
        `function a(){console.log(typeof window === 'undefined')}`
      )
      expect(code).toMatchInlineSnapshot(`"function a(){console.log(false);}"`)
    })

    it('should replace typeof window expression top level', async () => {
      const code = await babel(`typeof window === 'undefined';`)
      expect(code).toMatchInlineSnapshot(`"false;"`)
    })

    it('should replace typeof window expression top level', async () => {
      const code = await babel(`typeof window === 'object';`)
      expect(code).toMatchInlineSnapshot(`"true;"`)
    })

    it('should replace typeof window expression top level', async () => {
      const code = await babel(`typeof window !== 'undefined';`)
      expect(code).toMatchInlineSnapshot(`"true;"`)
    })

    it('should replace typeof window expression top level', async () => {
      const code = await babel(`typeof window !== 'object';`)
      expect(code).toMatchInlineSnapshot(`"false;"`)
    })

    it('should replace typeof window expression top level', async () => {
      const code = await babel(`typeof window !== 'undefined';`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"false;"`)
    })

    it('should replace typeof window expression top level', async () => {
      const code = await babel(`typeof window !== 'object';`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"true;"`)
    })

    it('should replace process.browser (1)', async () => {
      const code = await babel(`process.browser`, {
        isServer: false,
      })
      expect(code).toMatchInlineSnapshot(`"true;"`)
    })

    it('should replace process.browser (2)', async () => {
      const code = await babel(`process.browser`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"false;"`)
    })

    it('should replace process.browser (3)', async () => {
      const code = await babel(`process.browser == false`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"true;"`)
    })

    it('should replace process.browser (4)', async () => {
      const code = await babel(`if (process.browser === false) {}`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"if(true){}"`)
    })

    it('should replace process.browser (5)', async () => {
      const code = await babel(`if (process.browser) {}`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"if(false){}"`)
    })

    it('should replace NODE_ENV on client (dev)', async () => {
      const code = await babel(`process.env.NODE_ENV`, {
        isServer: false,
        development: true,
      })
      expect(code).toMatchInlineSnapshot(`"\\"development\\";"`)
    })

    it('should replace NODE_ENV on client (prod)', async () => {
      const code = await babel(`process.env.NODE_ENV`, {
        isServer: false,
        development: false,
      })
      expect(code).toMatchInlineSnapshot(`"\\"production\\";"`)
    })

    it('should replace NODE_ENV on server', async () => {
      const code = await babel(`process.env.NODE_ENV`, {
        isServer: true,
      })
      expect(code).toMatchInlineSnapshot(`"\\"production\\";"`)
    })

    it('should replace NODE_ENV in statement (dev)', async () => {
      const code = await babel(
        `if (process.env.NODE_ENV === 'development') {}`,
        { development: true }
      )
      expect(code).toMatchInlineSnapshot(`"if(true){}"`)
    })

    it('should replace NODE_ENV in statement (prod)', async () => {
      const code = await babel(`if (process.env.NODE_ENV === 'production') {}`)
      expect(code).toMatchInlineSnapshot(`"if(true){}"`)
    })

    it('should replace NODE_ENV in statement (prod)', async () => {
      const code = await babel(`if (process.env.NODE_ENV !== 'production') {}`)
      expect(code).toMatchInlineSnapshot(`"if(false){}"`)
    })
  })
})
