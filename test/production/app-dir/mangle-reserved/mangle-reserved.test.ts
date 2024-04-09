import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'mangle-reserved',
  {
    files: __dirname,
  },
  ({ next }) => {
    ;(process.env.TURBOPACK ? it.skip : it)(
      'should work using cheerio',
      async () => {
        const $ = await next.render$('/')
        // eslint-disable-next-line jest/no-standalone-expect
        expect($('p').text()).toBe('AbortSignal')
      }
    )
  }
)
