/* eslint-env jest */

// avoid generating __source annotations in JSX during testing:
const NODE_ENV = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
require('next/dist/build/babel/preset')
process.env.NODE_ENV = NODE_ENV

const loader = require('next/dist/build/webpack/loaders/next-babel-loader')
const os = require('os')
const path = require('path')

const dir = path.resolve(os.tmpdir())

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
        cwd: dir,
        isServer,
        distDir: path.resolve(dir, '.next'),
        pagesDir: path.resolve(dir, 'pages'),
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

    it('should not drop unused exports by default', async () => {
      const code = await babel(
        // effectful
        `import"core-js";` +
          // basic
          `import{foo,bar}from"a";import baz from"b";` +
          // complex
          `import * as React from "react";` +
          `import baz2,{yeet}from"c";` +
          `import baz3,{cats}from"d";` +
          `import{c,d}from"e";` +
          `import{e as ee,f as ff}from"f";`
      )
      expect(code).toMatchInlineSnapshot(
        `"import\\"core-js\\";import{foo,bar}from\\"a\\";import baz from\\"b\\";import*as React from\\"react\\";import baz2,{yeet}from\\"c\\";import baz3,{cats}from\\"d\\";import{c,d}from\\"e\\";import{e as ee,f as ff}from\\"f\\";"`
      )
    })

    const pageFile = path.resolve(dir, 'pages', 'index.js')

    it('should not drop unused exports by default in a page', async () => {
      const code = await babel(
        // effectful
        `import"core-js";` +
          // basic
          `import{foo,bar}from"a";import baz from"b";` +
          // complex
          `import*as React from"react";` +
          `import baz2,{yeet}from"c";` +
          `import baz3,{cats}from"d";` +
          `import{c,d}from"e";` +
          `import{e as ee,f as ff}from"f";`,
        { resourcePath: pageFile }
      )
      expect(code).toMatchInlineSnapshot(
        `"import\\"core-js\\";import{foo,bar}from\\"a\\";import baz from\\"b\\";import*as React from\\"react\\";import baz2,{yeet}from\\"c\\";import baz3,{cats}from\\"d\\";import{c,d}from\\"e\\";import{e as ee,f as ff}from\\"f\\";"`
      )
    })

    it('should drop unused exports in a modern-apis page', async () => {
      const code = await babel(
        // effectful
        `import"core-js";` +
          // basic
          `import{foo,bar}from"a";import baz from"b";` +
          // complex
          `import*as React from"react";` +
          `import baz2,{yeet}from"c";` +
          `import baz3,{cats}from"d";` +
          `import{c,d}from"e";` +
          `import{e as ee,f as ff}from"f";` +
          `` +
          `export function unstable_getStaticProps() {foo;bar;baz;cats;baz2;ff; return { props: {} } }`,
        { resourcePath: pageFile }
      )
      expect(code).toMatchInlineSnapshot(
        `"import\\"core-js\\";import*as React from\\"react\\";import{yeet}from\\"c\\";import baz3 from\\"d\\";import{c,d}from\\"e\\";import{e as ee}from\\"f\\";"`
      )
    })

    it('should keep used exports in a modern-apis page (server)', async () => {
      const code = await babel(
        // effectful
        `import"core-js";` +
          // basic
          `import{foo,bar}from"a";import baz from"b";import ooo from"ooo";` +
          // complex
          `import*as React from"react";` +
          `import baz2,{yeet}from"c";` +
          `import baz3,{cats}from"d";` +
          `import{c,d}from"e";` +
          `import{e as ee,f as ff}from"f";` +
          `` +
          `export function unstable_getStaticProps() {foo();baz2();ff();ooo(); return { props: {} }}` +
          `export default function () { return bar(); }`,
        { resourcePath: pageFile, isServer: true }
      )
      expect(code).toMatchInlineSnapshot(
        `"import\\"core-js\\";import{foo,bar}from\\"a\\";import baz from\\"b\\";import ooo from\\"ooo\\";import*as React from\\"react\\";import baz2,{yeet}from\\"c\\";import baz3,{cats}from\\"d\\";import{c,d}from\\"e\\";import{e as ee,f as ff}from\\"f\\";export function unstable_getStaticProps(){foo();baz2();ff();ooo();return{props:{}};}export default function(){return bar();}"`
      )
    })

    it('should keep used exports in a modern-apis page (client)', async () => {
      const code = await babel(
        // effectful
        `import"core-js";` +
          // basic
          `import{foo,bar}from"a";import baz from"b";import ooo from"ooo";` +
          // complex
          `import*as React from"react";` +
          `import baz2,{yeet}from"c";` +
          `import baz3,{cats}from"d";` +
          `import{c,d}from"e";` +
          `import{e as ee,f as ff}from"f";` +
          `` +
          `export function unstable_getStaticProps() {foo();baz2();ff();ooo();cats; return { props: {} }}` +
          `export default function () { return cats + bar(); }`,
        { resourcePath: pageFile, isServer: false }
      )
      expect(code).toMatchInlineSnapshot(
        `"import\\"core-js\\";import{bar}from\\"a\\";import baz from\\"b\\";import*as React from\\"react\\";import{yeet}from\\"c\\";import baz3,{cats}from\\"d\\";import{c,d}from\\"e\\";import{e as ee}from\\"f\\";const __NEXT_COMP=function(){return cats+bar();};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should keep used exports and react in a modern-apis page with JSX (client)', async () => {
      const code = await babel(
        // effectful
        `import"core-js";` +
          // basic
          `import{foo,bar}from"a";import baz from"b";import ooo from"ooo";` +
          // complex
          `import*as React from"react";` +
          `import baz2,{yeet}from"c";` +
          `import baz3,{cats}from"d";` +
          `import{c,d}from"e";` +
          `import{e as ee,f as ff}from"f";` +
          `` +
          `export function unstable_getStaticProps() {foo();baz2();ff();ooo(); return { props: {} }}` +
          `export default function () { return <div>{cats + bar()}</div> }`,
        { resourcePath: pageFile, isServer: false }
      )
      expect(code).toMatchInlineSnapshot(
        `"var __jsx=React.createElement;import\\"core-js\\";import{bar}from\\"a\\";import baz from\\"b\\";import*as React from\\"react\\";import{yeet}from\\"c\\";import baz3,{cats}from\\"d\\";import{c,d}from\\"e\\";import{e as ee}from\\"f\\";const __NEXT_COMP=function(){return __jsx(\\"div\\",null,cats+bar());};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })
  })
})
