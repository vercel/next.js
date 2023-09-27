import { createNextDescribe } from 'e2e-utils'
// import { nextBuild } from 'next-test-utils'

createNextDescribe(
  'no deopt into client rendering',
  {
    files: `${__dirname}/not-deopted`,
  },
  ({ next }) => {
    it('should not show warning for deopted into client rendering', async () => {
      expect(next.cliOutput).not.toContain(
        'Entire page / deopted into client-side rendering'
      )
    })
  }
)

createNextDescribe(
  'deopted into client rendering',
  {
    files: `${__dirname}/deopted`,
  },
  ({ next }) => {
    it('should show warning for deopted into client rendering', async () => {
      expect(next.cliOutput).toContain(
        'Entire page / deopted into client-side rendering'
      )
    })

    it('should not contain html error id in SSR content', async () => {
      const $ = await next.render$('/')
      expect($('html').attr('id')).toBeUndefined()
    })
  }
)
