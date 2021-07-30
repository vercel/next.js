/* eslint-env jest */
import { transform } from 'next/dist/build/swc'

const trim = (s) => s.join('\n').trim().replace(/^\s+/gm, '')

const swc = async (code) => {
  let output = await transform(code, {
    jsc: {
      parser: {
        syntax: 'ecmascript',
        jsx: true,
      },
      transform: {
        react: {
          pragma: '__jsx',
        },
      },
      target: 'es2021',
    },
    minify: true,
  })
  return output.code
}

describe('babel plugin (next-ssg-transform)', () => {
  describe('getStaticProps support', () => {
    it(`should remove re-exported function declarations' dependents (variables, functions, imports)`, async () => {
      const output = await swc(trim`
        import keep_me from 'hello'
        import {keep_me2} from 'hello2'
        import * as keep_me3 from 'hello3'

        import drop_me from 'bla'
        import { drop_me2 } from 'foo'
        import { drop_me3, but_not_me } from 'bar'
        import * as remove_mua from 'hehe'

        var leave_me_alone = 1;
        function dont_bug_me_either() {}

        const inceptionVar = 'hahaa';
        var var1 = 1;
        let var2 = 2;
        const var3 = inceptionVar + remove_mua;

        function inception1() {var2;drop_me2;}

        function abc() {}
        const b = function() {var3;drop_me3;};
        const b2 = function apples() {};
        const bla = () => {inception1};

        function getStaticProps() {
          abc();
          drop_me;
          b;
          b2;
          bla();
          return { props: {var1} }
        }

        export { getStaticProps }

        export default function Test() {
          return <div />
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"import keep_me from'hello';import{keep_me2}from'hello2';import*as keep_me3 from'hello3';import{but_not_me}from'bar';var leave_me_alone=1;function dont_bug_me_either(){}export var __N_SSG=true;export default function Test(){return __jsx(\\"div\\",null);}"`
      )
    })

    it('should support class exports', async () => {
      const output = await swc(trim`
        export function getStaticProps() {
          return { props: {} }
        }

        export default class Test extends React.Component {
          render() {
            return <div />
          }
        }
      `)

      expect(output).toMatchInlineSnapshot(
        `"export var __N_SSG=true;export default class Test extends React.Component{render(){return __jsx(\\"div\\",null);}}"`
      )
    })

    it('should support class exports 2', async () => {
      const output = await swc(trim`
        export function getStaticProps() {
          return { props: {} }
        }

        class Test extends React.Component {
          render() {
            return <div />
          }
        }

        export default Test;
      `)

      expect(output).toMatchInlineSnapshot(
        `"class Test extends React.Component{render(){return __jsx(\\"div\\",null);}}export var __N_SSG=true;export default Test;"`
      )
    })

    it('should support export { _ as default }', async () => {
      const output = await swc(trim`
        export function getStaticProps() {
          return { props: {} }
        }

        function El() {
          return <div />
        }

        export { El as default }
      `)

      expect(output).toMatchInlineSnapshot(
        `"function El(){return __jsx(\\"div\\",null);}export var __N_SSG=true;export{El as default};"`
      )
    })

    it('should support export { _ as default } with other specifiers', async () => {
      const output = await swc(trim`
        export function getStaticProps() {
          return { props: {} }
        }

        function El() {
          return <div />
        }

        const a = 5

        export { El as default, a }
      `)

      expect(output).toMatchInlineSnapshot(
        `"function El(){return __jsx(\\"div\\",null);}const a=5;export var __N_SSG=true;export{El as default,a};"`
      )
    })

    it('should support export { _ as default } with a class', async () => {
      const output = await swc(trim`
        export function getStaticProps() {
          return { props: {} }
        }

        class El extends React.Component {
          render() {
            return <div />
          }
        }

        const a = 5

        export { El as default, a }
      `)

      expect(output).toMatchInlineSnapshot(
        `"class El extends React.Component{render(){return __jsx(\\"div\\",null);}}const a=5;export var __N_SSG=true;export{El as default,a};"`
      )
    })

    it('should support full re-export', async () => {
      const output = await swc(trim`
        export { getStaticProps, default } from 'a'
      `)

      expect(output).toMatchInlineSnapshot(
        `"export var __N_SSG=true;export{default}from'a';"`
      )
    })

    it('errors for incorrect mix of functions', () => {
      expect(() =>
        swc(trim`
          export function getStaticProps() {}
          export function getServerSideProps() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )

      expect(() =>
        swc(trim`
          export function getServerSideProps() {}
          export function getStaticProps() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )

      expect(() =>
        swc(trim`
          export function getStaticPaths() {}
          export function getServerSideProps() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )

      expect(() =>
        swc(trim`
          export function getServerSideProps() {}
          export function getStaticPaths() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )
    })
  })
})
