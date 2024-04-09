import { createNextDescribe } from 'e2e-utils'
;(process.env.TURBOPACK ? describe.skip : describe)(
  'Skipped in Turbopack',
  () => {
    createNextDescribe(
      'mangle-reserved',
      {
        files: __dirname,
      },
      ({ next }) => {
        it('should work using cheerio', async () => {
          const $ = await next.render$('/')
          expect($('p').text()).toBe('AbortSignal')
        })
      }
    )
  }
)
