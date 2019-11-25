/* eslint-env jest */
import { transform } from '@babel/core'

const trim = s =>
  s
    .join('\n')
    .trim()
    .replace(/^\s+/gm, '')

// avoid generating __source annotations in JSX during testing:
const NODE_ENV = process.env.NODE_ENV
process.env.NODE_ENV = 'production'
const plugin = require('next/dist/build/babel/plugins/next-page-config')
process.env.NODE_ENV = NODE_ENV

const babel = (code, esm = true, pluginOptions = {}) =>
  transform(code, {
    filename: 'noop.js',
    presets: [['@babel/preset-react', { development: false, pragma: '__jsx' }]],
    plugins: [[plugin, pluginOptions]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    compact: true,
    caller: {
      name: 'tests',
      supportsStaticESM: esm,
    },
  }).code

describe('babel plugin (next-page-config)', () => {
  describe('getStaticProps support', () => {
    it('should remove separate named export specifiers', () => {
      const output = babel(trim`
        export { unstable_getStaticParams } from '.'
        export { a as unstable_getStaticProps } from '.'

        export default function Test() {
          return <div />
        }
      `)
      expect(output).toMatchInlineSnapshot(
        `"const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should remove combined named export specifiers', () => {
      const output = babel(trim`
        export { unstable_getStaticParams, a as unstable_getStaticProps } from '.'

        export default function Test() {
          return <div />
        }
      `)
      expect(output).toMatchInlineSnapshot(
        `"const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should retain extra named export specifiers', () => {
      const output = babel(trim`
        export { unstable_getStaticParams, a as unstable_getStaticProps, foo, bar as baz } from '.'

        export default function Test() {
          return <div />
        }
      `)
      expect(output).toMatchInlineSnapshot(
        `"export{foo,bar as baz}from'.';const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should remove named export declarations', () => {
      const output = babel(trim`
        export function unstable_getStaticParams() {
          return []
        }

        export function unstable_getStaticProps() {
          return { props: {} }
        }

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should not remove extra named export declarations', () => {
      const output = babel(trim`
        export function unstable_getStaticProps() {
          return { props: {} }
        }

        export function Noop() {}

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"export function Noop(){}const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })
  })
})
