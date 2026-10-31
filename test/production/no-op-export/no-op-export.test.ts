import { nextTestSetup } from 'e2e-utils'

describe('no-op export', () => {
  describe('all server-side pages build', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should not error for all server-side pages build', async () => {
      await next.patchFile(
        'pages/_error.js',
        `
import React from 'react'
export default class Error extends React.Component {
  static async getInitialProps() {
    return {
      props: {
        statusCode: 'oops'
      }
    }
  }
  render() {
    return 'error page'
  }
}
`
      )
      await next.patchFile(
        'pages/[slug].js',
        `
export const getStaticProps = () => {
  return {
    props: {}
  }
}
export const getStaticPaths = () => {
  return {
    paths: [],
    fallback: false
  }
}
export default function Page() {
  return 'page'
}
`
      )
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })
  })

  describe('empty exportPathMap', () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should not error for empty exportPathMap', async () => {
      await next.patchFile(
        'pages/index.js',
        `
export default function Index() {
  return 'hello world'
}
`
      )
      await next.patchFile(
        'next.config.js',
        `
module.exports = {
  output: 'export',
  exportPathMap() {
    return {}
  }
}
`
      )
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })
  })
})
