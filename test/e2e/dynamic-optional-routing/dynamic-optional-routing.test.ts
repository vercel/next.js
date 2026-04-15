import cheerio from 'cheerio'
import { nextTestSetup } from 'e2e-utils'

describe('Dynamic Optional Routing', () => {
  const { next } = nextTestSetup({ files: __dirname })

  it('should render catch-all top-level route with multiple segments', async () => {
    const html = await next.render('/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: [hello|world]')
  })

  it('should render catch-all top-level route with single segment', async () => {
    const html = await next.render('/hello')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: [hello]')
  })

  it('should render catch-all top-level route with no segments', async () => {
    const html = await next.render('/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('top level route param: undefined')
  })

  it('should render catch-all nested route with multiple segments', async () => {
    const html = await next.render('/nested/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: [hello|world]')
  })

  it('should render catch-all nested route with single segment', async () => {
    const html = await next.render('/nested/hello')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: [hello]')
  })

  it('should render catch-all nested route with no segments', async () => {
    const html = await next.render('/nested')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: undefined')
  })

  it('should render catch-all nested route with no segments and leading slash', async () => {
    const html = await next.render('/nested/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('nested route param: undefined')
  })

  it('should match catch-all api route with multiple segments', async () => {
    const res = await next.fetch('/api/post/ab/cd')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['ab', 'cd'] })
  })

  it('should match catch-all api route with single segment', async () => {
    const res = await next.fetch('/api/post/a')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slug: ['a'] })
  })

  it('should match catch-all api route with no segments', async () => {
    const res = await next.fetch('/api/post')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should match catch-all api route with no segments and leading slash', async () => {
    const res = await next.fetch('/api/post/')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({})
  })

  it('should handle getStaticPaths no segments', async () => {
    const html = await next.render('/get-static-paths')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: undefined')
  })

  it('should handle getStaticPaths no segments and trailing slash', async () => {
    const html = await next.render('/get-static-paths/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: undefined')
  })

  it('should handle getStaticPaths 1 segment', async () => {
    const html = await next.render('/get-static-paths/p1')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p1]')
  })

  it('should handle getStaticPaths 1 segment and trailing slash', async () => {
    const html = await next.render('/get-static-paths/p1/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p1]')
  })

  it('should handle getStaticPaths 2 segments', async () => {
    const html = await next.render('/get-static-paths/p2/p3')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p2|p3]')
  })

  it('should handle getStaticPaths 2 segments and trailing slash', async () => {
    const html = await next.render('/get-static-paths/p2/p3/')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp route: [p2|p3]')
  })

  it('should fall back to top-level catch-all', async () => {
    const html = await next.render('/get-static-paths/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'top level route param: [get-static-paths|hello|world]'
    )
  })

  it('should match root path on undefined param', async () => {
    const html = await next.render('/get-static-paths-undefined')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp undefined route: undefined')
  })

  it('should match root path on false param', async () => {
    const html = await next.render('/get-static-paths-false')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp false route: undefined')
  })

  it('should match root path on null param', async () => {
    const html = await next.render('/get-static-paths-null')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp null route: undefined')
  })

  it('should handle getStaticPaths with fallback no segments', async () => {
    const html = await next.render('/get-static-paths-fallback')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'gsp fallback route: undefined is not fallback'
    )
  })

  it('should handle getStaticPaths with fallback 2 segments', async () => {
    const html = await next.render('/get-static-paths-fallback/p2/p3')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe(
      'gsp fallback route: [p2|p3] is not fallback'
    )
  })

  it('should fallback correctly when fallback enabled', async () => {
    const html = await next.render('/get-static-paths-fallback/hello/world')
    const $ = cheerio.load(html)
    expect($('#route').text()).toBe('gsp fallback route: undefined is fallback')
  })
})
