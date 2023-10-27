/* eslint-env jest */
import os from 'os'
import path from 'path'
import { Span } from 'next/dist/trace'
import loader from 'next/dist/build/babel/loader'

const dir = path.resolve(os.tmpdir())

const babel = async (code: string, queryOpts = {} as any) => {
  const { isServer = false, resourcePath = `index.js` } = queryOpts

  let isAsync = false

  const options = {
    // loader opts
    cwd: dir,
    isServer,
    distDir: path.resolve(dir, '.next'),
    pagesDir:
      'pagesDir' in queryOpts ? queryOpts.pagesDir : path.resolve(dir, 'pages'),
    cache: false,
    development: true,
    hasReactRefresh: !isServer,
  }
  return new Promise<string>((resolve, reject) => {
    function callback(err, content) {
      if (err) {
        reject(err)
      } else {
        resolve(content.replace(/\n/g, ''))
      }
    }

    const res = loader.bind({
      resourcePath,
      async() {
        isAsync = true
        return callback
      },
      callback,
      emitWarning() {},
      query: options,
      getOptions: function () {
        return options
      },
      currentTraceSpan: new Span({ name: 'test' }),
    })(code, null)

    if (!isAsync) {
      resolve(res)
    }
  })
}

describe('next-babel-loader', () => {
  describe('replace constants', () => {
    it('should replace NODE_ENV on client (dev)', async () => {
      const code = await babel(`process.env.NODE_ENV`, {
        isServer: false,
      })
      expect(code).toMatchInlineSnapshot(`""development";"`)
    })

    it('should replace NODE_ENV in statement (dev)', async () => {
      const code = await babel(`if (process.env.NODE_ENV === 'development') {}`)
      expect(code).toMatchInlineSnapshot(`"if (true) {}"`)
    })

    it('should support 9.4 regression', async () => {
      const pageFile = path.resolve(dir, 'pages', 'index.js')
      const output = await babel(
        `
          import React from "react";
          import queryGraphql from "../graphql/schema";

          const gql = String.raw;

          export default function Home({ greeting }) {
            return <h1>{greeting}</h1>;
          }

          export async function getStaticProps() {
            const greeting = await getGreeting();

            return {
              props: {
                greeting,
              },
            };
          }

          async function getGreeting() {
            const result = await queryGraphql(
              gql\`
                {
                  query {
                    greeting
                  }
                }
              \`
            );

            return result.data.greeting;
          }
        `,
        { resourcePath: pageFile, isServer: false }
      )

      expect(output).toContain(
        `var __jsx = React.createElement;import React from "react";export var __N_SSG = true;export default function Home(_ref) {  var greeting = _ref.greeting;  return __jsx("h1", {    __self: this,    __source: {      fileName: _jsxFileName,      lineNumber: 8,      columnNumber: 20    }  }, greeting);}_c = Home;var _c;$RefreshReg$(_c, "Home");`
      )
    })
  })
})
