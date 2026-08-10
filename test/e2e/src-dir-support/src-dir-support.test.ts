import { nextTestSetup } from 'e2e-utils'

describe('Dynamic Routing with src dir', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should render normal route', async () => {
    const html = await next.render('/')
    expect(html).toMatch(/my blog/i)
  })

  it('should render another normal route', async () => {
    const html = await next.render('/another')
    expect(html).toMatch(/hello from another/)
  })

  it('should render dynamic page', async () => {
    const html = await next.render('/post-1')
    expect(html).toMatch(/this is.*?post-1/i)
  })

  it('should prioritize a non-dynamic page', async () => {
    const html = await next.render('/post-1/comments')
    expect(html).toMatch(/show comments for.*post-1.*here/i)
  })

  it('should render nested dynamic page', async () => {
    const html = await next.render('/post-1/comment-1')
    expect(html).toMatch(/i am.*comment-1.*on.*post-1/i)
  })

  it('should navigate to a dynamic page successfully', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#view-post-1').click()
    await browser.waitForElementByCss('p#post-1')

    const text = await browser.elementByCss('p#post-1').text()
    expect(text).toMatch(/this is.*?post-1/i)
  })

  it('should navigate to a nested dynamic page successfully', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#view-post-1-comment-1').click()
    await browser.waitForElementByCss('p#comment-1')

    const text = await browser.elementByCss('p#comment-1').text()
    expect(text).toMatch(/i am.*comment-1.*on.*post-1/i)
  })

  it('should pass params in getInitialProps during SSR', async () => {
    const html = await next.render('/post-1/cmnt-1')
    expect(html).toMatch(/gip.*post-1/i)
  })
})
