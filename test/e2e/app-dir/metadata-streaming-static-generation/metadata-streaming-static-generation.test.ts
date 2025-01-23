import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-streaming-static-generation', () => {
  const { next, isNextDev, isNextStart } = nextTestSetup({
    files: __dirname,
  })

  if (isNextStart) {
    // Precondition for the following tests in build mode
    it('should generate all pages static', async () => {
      const prerenderManifest = JSON.parse(
        await next.readFile('.next/prerender-manifest.json')
      )
      const staticRoutes = prerenderManifest.routes
      expect(Object.keys(staticRoutes).sort()).toEqual([
        '/',
        '/slow/static',
        '/suspenseful/static',
      ])
    })
  }

  if (isNextDev) {
    describe('static pages (development)', () => {
      it('should contain async generated metadata in body for simple static page', async () => {
        const $ = await next.render$('/')
        expect($('body title').text()).toBe('index page')
      })

      it('should contain async generated metadata in body for slow static page', async () => {
        const $ = await next.render$('/slow/static')
        expect($('body title').text()).toBe('slow page - static')
      })

      it('should contain async generated metadata in body static page with suspenseful content', async () => {
        const $ = await next.render$('/suspenseful/static')
        expect($('body title').text()).toBe('suspenseful page - static')
      })
    })
  } else {
    describe('static pages (production)', () => {
      it('should contain async generated metadata in head for simple static page', async () => {
        const $ = await next.render$('/')
        expect($('head title').text()).toBe('index page')
      })

      it('should contain async generated metadata in head for slow static page', async () => {
        const $ = await next.render$('/slow/static')
        expect($('head title').text()).toBe('slow page - static')
      })

      it('should contain async generated metadata in head static page with suspenseful content', async () => {
        const $ = await next.render$('/suspenseful/static')
        expect($('head title').text()).toBe('suspenseful page - static')
      })
    })
  }

  describe('dynamic pages', () => {
    it('should contain async generated metadata in body for simple dynamics page', async () => {
      const $ = await next.render$('/suspenseful/dynamic')
      expect($('body title').text()).toBe('suspenseful page - dynamic')
    })

    it('should contain async generated metadata in body for suspenseful dynamic page', async () => {
      const $ = await next.render$('/slow/dynamic')
      expect($('body title').text()).toBe('slow page - dynamic')
    })
  })

  describe('dynamic pages with html limited bots', () => {
    it('should contain async generated metadata in body for simple dynamics page', async () => {
      const $ = await next.render$('/suspenseful/dynamic', {
        headers: {
          'User-Agent': 'Discordbot/2.0;',
        },
      })
      expect($('body title').text()).toBe('suspenseful page - dynamic')
    })

    it('should contain async generated metadata in body for suspenseful dynamic page', async () => {
      const $ = await next.render$('/slow/dynamic', {
        headers: {
          'User-Agent': 'Discordbot/2.0;',
        },
      })
      expect($('body title').text()).toBe('slow page - dynamic')
    })
  })
})
