import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('navlink', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('marks the matching link active in the SSR HTML with aria-current (flicker-free)', async () => {
    const $ = await next.render$('/blog')
    const blog = $('nav a[href="/blog"]').first()
    expect(blog.attr('aria-current')).toBe('page')
    expect(blog.attr('data-active')).toBe('')
    expect(blog.attr('class')).toContain('active-blog')

    // Non-greedy "/": home is not active on another route.
    const home = $('nav a[href="/"]')
    expect(home.attr('aria-current')).toBeUndefined()
    expect(home.attr('data-active')).toBeUndefined()
    expect(home.attr('class') || '').not.toContain('active-home')
  })

  it('root link stays exact so it is not active everywhere', async () => {
    const $ = await next.render$('/')
    expect($('nav a[href="/"]').attr('aria-current')).toBe('page')
    expect($('nav a[href="/"]').attr('class')).toContain('active-home')

    const onBlog = await next.render$('/blog')
    expect(onBlog('nav a[href="/"]').attr('aria-current')).toBeUndefined()
  })

  it('matches nested routes by default (prefix) with data-active but not aria-current', async () => {
    const $ = await next.render$('/blog/first')
    const blog = $('nav a[href="/blog"]').first()
    // The active class and data-active apply to the ancestor via prefix matching...
    expect(blog.attr('class')).toContain('active-blog')
    expect(blog.attr('data-active')).toBe('')
    // ...but aria-current="page" is reserved for the exact current page, so an
    // ancestor link must not claim to be the page.
    expect(blog.attr('aria-current')).toBeUndefined()
    expect($('nav a[href="/"]').attr('data-active')).toBeUndefined()
    expect($('nav a[href="/"]').attr('aria-current')).toBeUndefined()
  })

  it('exact restricts matching to the exact path (not nested)', async () => {
    // On /blog both the default and exact links are active.
    const onBlog = await next.render$('/blog')
    expect(onBlog('nav a.blog-exact').attr('aria-current')).toBe('page')
    expect(onBlog('nav a.blog-exact').attr('class')).toContain(
      'active-blog-exact'
    )

    // On a nested route only the default (prefix) link stays active.
    const onNested = await next.render$('/blog/first')
    expect(onNested('nav a.blog-exact').attr('aria-current')).toBeUndefined()
    expect(onNested('nav a.blog-exact').attr('class') || '').not.toContain(
      'active-blog-exact'
    )
  })

  it('resolves a function className with isActive', async () => {
    const onAbout = await next.render$('/about')
    expect(onAbout('nav a[href="/about"]').attr('class')).toContain('fn-active')

    const offAbout = await next.render$('/')
    expect(offAbout('nav a[href="/about"]').attr('class')).toContain('fn-idle')
  })

  it('resolves function children with isActive', async () => {
    const onContact = await next.render$('/contact')
    expect(onContact('nav a[href="/contact"]').text()).toBe('Contact-on')

    const offContact = await next.render$('/')
    expect(offContact('nav a[href="/contact"]').text()).toBe('Contact-off')
  })

  it('updates the active link on client navigation', async () => {
    const browser = await next.browser('/')
    expect(
      await browser.elementByCss('nav a[href="/"]').getAttribute('aria-current')
    ).toBe('page')

    await browser.elementByCss('nav a[href="/blog"]').click()

    await retry(async () => {
      expect(
        await browser
          .elementByCss('nav a[href="/blog"]')
          .getAttribute('aria-current')
      ).toBe('page')
      expect(
        await browser
          .elementByCss('nav a[href="/"]')
          .getAttribute('aria-current')
      ).toBeNull()
    })
  })
})
