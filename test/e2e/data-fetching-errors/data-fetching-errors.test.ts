import { nextTestSetup, isNextDev, isNextStart } from 'e2e-utils'
import { retry } from 'next-test-utils'
import {
  GSP_NO_RETURNED_VALUE,
  GSSP_NO_RETURNED_VALUE,
} from '../../../packages/next/dist/lib/constants'

describe('GS(S)P Page Errors', () => {
  ;(isNextDev ? describe : describe.skip)('development mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipDeployment: true,
    })
    if (skipped) return

    it('should show error for getStaticProps as component member', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/index.js',
        `
        const Page = () => 'hi'
        Page.getStaticProps = () => ({ props: { hello: 'world' }})
        export default Page
      `
      )
      await next.render('/')
      expect(next.cliOutput.slice(outputIndex)).toContain(
        `getStaticProps can not be attached to a page's component and must be exported from the page`
      )
    })

    it('should show error for getServerSideProps as component member', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/index.js',
        `
        import React from 'react'
        export default class MyPage extends React.Component {
          static async getServerSideProps() {
            return {
              props: {
                hello: 'world'
              }
            }
          }
          render() {
            return 'hi'
          }
        }
      `
      )
      await next.render('/')
      expect(next.cliOutput.slice(outputIndex)).toContain(
        `getServerSideProps can not be attached to a page's component and must be exported from the page`
      )
    })

    it('should show error for getStaticPaths as component member', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/index.js',
        `
        const Page = () => 'hi'
        Page.getStaticPaths = () => ({ paths: [], fallback: true })
        export default Page
      `
      )
      await next.render('/')
      expect(next.cliOutput.slice(outputIndex)).toContain(
        `getStaticPaths can not be attached to a page's component and must be exported from the page`
      )
    })

    it('should show error for undefined getStaticProps', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/index.js',
        `
          export function getStaticProps() {}
          export default function Page() {
            return <div />;
          }
        `
      )
      await next.render('/')
      expect(next.cliOutput.slice(outputIndex)).toContain(GSP_NO_RETURNED_VALUE)
    })

    it('should show error for undefined getServerSideProps', async () => {
      const outputIndex = next.cliOutput.length
      await next.patchFile(
        'pages/index.js',
        `
          export function getServerSideProps() {}
          export default function Page() {
            return <div />;
          }
        `
      )
      await next.render('/')
      expect(next.cliOutput.slice(outputIndex)).toContain(
        GSSP_NO_RETURNED_VALUE
      )
    })
  })
  ;(isNextStart ? describe : describe.skip)('production mode', () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      skipStart: true,
      skipDeployment: true,
    })
    if (skipped) return

    it('should show build error for getStaticProps as component member', async () => {
      await next.patchFile(
        'pages/index.js',
        `
        const Page = () => 'hi'
        Page.getStaticProps = () => ({ props: { hello: 'world' }})
        export default Page
      `
      )
      const outputIndex = next.cliOutput.length
      await next.build()
      expect(next.cliOutput.slice(outputIndex)).toContain(
        `getStaticProps can not be attached to a page's component and must be exported from the page`
      )
    })

    it('should show build error for getServerSideProps as component member', async () => {
      await next.patchFile(
        'pages/index.js',
        `
        import React from 'react'
        export default class MyPage extends React.Component {
          static async getServerSideProps() {
            return {
              props: {
                hello: 'world'
              }
            }
          }
          render() {
            return 'hi'
          }
        }
      `
      )
      const outputIndex = next.cliOutput.length
      await next.build()
      expect(next.cliOutput.slice(outputIndex)).toContain(
        `getServerSideProps can not be attached to a page's component and must be exported from the page`
      )
    })

    it('should show build error for getStaticPaths as component member', async () => {
      await next.patchFile(
        'pages/index.js',
        `
        const Page = () => 'hi'
        Page.getStaticPaths = () => ({ paths: [], fallback: true })
        export default Page
      `
      )
      const outputIndex = next.cliOutput.length
      await next.build()
      expect(next.cliOutput.slice(outputIndex)).toContain(
        `getStaticPaths can not be attached to a page's component and must be exported from the page`
      )
    })

    it('should show build error for undefined getStaticProps', async () => {
      await next.patchFile(
        'pages/index.js',
        `
          export function getStaticProps() {}
          export default function Page() {
            return <div />;
          }
        `
      )
      const outputIndex = next.cliOutput.length
      await next.build()
      expect(next.cliOutput.slice(outputIndex)).toContain(GSP_NO_RETURNED_VALUE)
    })

    it('Error stack printed to stderr', async () => {
      await next.patchFile(
        'pages/index.js',
        `export default function Page() {
            return <div/>
          }
            export function getStaticProps() {
              // Make it pass on the build phase
              if(process.env.NEXT_PHASE === "phase-production-build") {
                return { props: { foo: 'bar' }, revalidate: 1 }
              }

              throw new Error("Oops")
            }
            `
      )

      await next.build()
      await next.start()
      const outputIndex = next.cliOutput.length
      await retry(async () => {
        await next.render('/')
        expect(next.cliOutput.slice(outputIndex)).toMatch(/error: oops/i)
      })
      expect(next.cliOutput.slice(outputIndex)).toContain('Error: Oops')
    })
  })
})
