import { nextTestSetup } from 'e2e-utils'

describe('pages-metadata-filenames', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support getStaticProps in a page named sitemap', async () => {
    const $ = await next.render$('/sitemap')
    expect($('#page').text()).toBe('sitemap')
  })

  it('should support getServerSideProps in a page named robots', async () => {
    const $ = await next.render$('/robots')
    expect($('#page').text()).toBe('robots')
  })
})
