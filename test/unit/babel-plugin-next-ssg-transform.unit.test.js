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
    it('errors for incorrect mix of functions', () => {
      expect(
        async () =>
          await swc(trim`
          export function getStaticProps() {}
          export function getServerSideProps() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )

      expect(
        async () =>
          await swc(trim`
          export function getServerSideProps() {}
          export function getStaticProps() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )

      expect(
        async () =>
          await swc(trim`
          export function getStaticPaths() {}
          export function getServerSideProps() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )

      expect(
        async () =>
          await swc(trim`
          export function getServerSideProps() {}
          export function getStaticPaths() {}
        `)
      ).toThrowError(
        `You can not use getStaticProps or getStaticPaths with getServerSideProps. To use SSG, please remove getServerSideProps`
      )
    })
  })
})
