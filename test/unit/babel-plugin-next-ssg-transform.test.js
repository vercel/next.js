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
const plugin = require('next/dist/build/babel/plugins/next-ssg-transform')
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

describe('babel plugin (next-ssg-transform)', () => {
  describe('getStaticProps support', () => {
    it('should remove separate named export specifiers', () => {
      const output = babel(trim`
        export { unstable_getStaticPaths } from '.'
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
        export { unstable_getStaticPaths, a as unstable_getStaticProps } from '.'

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
        export { unstable_getStaticPaths, a as unstable_getStaticProps, foo, bar as baz } from '.'

        export default function Test() {
          return <div />
        }
      `)
      expect(output).toMatchInlineSnapshot(
        `"export{foo,bar as baz}from'.';const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should remove named export function declarations', () => {
      const output = babel(trim`
        export function unstable_getStaticPaths() {
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

    it('should remove named export function declarations (async)', () => {
      const output = babel(trim`
        export async function unstable_getStaticPaths() {
          return []
        }

        export async function unstable_getStaticProps() {
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

    it('should not remove extra named export function declarations', () => {
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

    it('should remove named export variable declarations', () => {
      const output = babel(trim`
        export const unstable_getStaticPaths = () => {
          return []
        }

        export const unstable_getStaticProps = function() {
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

    it('should remove named export variable declarations (async)', () => {
      const output = babel(trim`
        export const unstable_getStaticPaths = async () => {
          return []
        }

        export const unstable_getStaticProps = async function() {
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

    it('should not remove extra named export variable declarations', () => {
      const output = babel(trim`
        export const unstable_getStaticPaths = () => {
          return []
        }, foo = 2

        export const unstable_getStaticProps = function() {
          return { props: {} }
        }

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"export const foo=2;const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should remove re-exported variable declarations', () => {
      const output = babel(trim`
        const unstable_getStaticPaths = () => {
          return []
        }

        export { unstable_getStaticPaths }

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should remove re-exported variable declarations (safe)', () => {
      const output = babel(trim`
        const unstable_getStaticPaths = () => {
          return []
        }, a = 2

        export { unstable_getStaticPaths }

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"const a=2;const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })

    it('should remove re-exported function declarations', () => {
      const output = babel(trim`
        function unstable_getStaticPaths() {
          return []
        }

        export { unstable_getStaticPaths }

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"const __NEXT_COMP=function Test(){return __jsx(\\"div\\",null);};__NEXT_COMP.__NEXT_SPR=true export default __NEXT_COMP;"`
      )
    })
  })
})
