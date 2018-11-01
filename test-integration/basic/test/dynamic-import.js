/* eslint-env jest */
/* global page, server */

describe('default behavior', () => {
  it('should render dynamic import components', async () => {
    const $ = await server.fetch$('/dynamic/ssr')
    // Make sure the client side knows it has to wait for the bundle
    expect($('body').html()).toContain('"dynamicIds":["./components/hello1.js"]')
    expect($('body').text()).toMatch(/Hello World 1/)
  })

  it('should render dynamic import components using a function as first parameter', async () => {
    const $ = await server.fetch$('/dynamic/function')
    // Make sure the client side knows it has to wait for the bundle
    expect($('body').html()).toContain('"dynamicIds":["./components/hello1.js"]')
    expect($('body').text()).toMatch(/Hello World 1/)
  })

  it('should render even there are no physical chunk exists', async () => {
    await page.goto(server.getURL('/dynamic/no-chunk'))
    await expect(page).toMatch('Welcome, normal')
    await expect(page).toMatch('Welcome, dynamic')
  })

  it('should render the component Head content', async () => {
    await page.goto(server.getURL('/dynamic/head'))
    const dynamicStyle = await expect(page).toMatchElement('.dynamic-style')
    /* istanbul ignore next */
    const backgroundColor = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('background-color'), dynamicStyle)
    /* istanbul ignore next */
    const height = await page.evaluate(e => window.getComputedStyle(e).getPropertyValue('height'), dynamicStyle)
    expect(height).toBe('200px')
    expect(backgroundColor).toBe('rgb(0, 128, 0)')
  })
})

describe('ssr:false option', () => {
  it('Should render loading on the server side', async () => {
    const $ = await server.fetch$('/dynamic/no-ssr')
    expect($('body').html()).not.toContain('"dynamicIds"')
    expect($('p').text()).toBe('loading...')
  })

  it('should render the component on client side', async () => {
    await page.goto(server.getURL('/dynamic/no-ssr'))
    await expect(page).toMatchElement('body', {
      text: 'Hello World 1'
    })
  })
})

describe('custom chunkfilename', () => {
  it('should render the correct filename', async () => {
    const $ = await server.fetch$('/dynamic/chunkfilename')
    expect($('body').text()).toMatch(/test chunkfilename/)
    expect($('html').html()).toMatch(/hello-world\.js/)
  })

  it('should render the component on client side', async () => {
    await page.goto(server.getURL('/dynamic/chunkfilename'))
    await expect(page).toMatchElement('body', {
      text: 'test chunkfilename'
    })
  })
})

describe('custom loading', () => {
  it('should render custom loading on the server side when `ssr:false` and `loading` is provided', async () => {
    const $ = await server.fetch$('/dynamic/no-ssr-custom-loading')
    expect($('p').text()).toBe('LOADING')
  })

  it('should render the component on client side', async () => {
    await page.goto(server.getURL('/dynamic/no-ssr-custom-loading'))
    await expect(page).toMatchElement('body', {
      text: 'Hello World 1'
    })
  })
})

describe('Multiple modules', () => {
  it('should only include the rendered module script tag', async () => {
    const $ = await server.fetch$('/dynamic/multiple-modules')
    const html = $('html').html()
    expect(html).toMatch(/hello1\.js/)
    expect(html).not.toMatch(/hello2\.js/)
  })

  it('should only load the rendered module in the browser', async () => {
    await page.goto(server.getURL('/dynamic/multiple-modules'))
    /* istanbul ignore next */
    const scripts = await page.$$eval('script[src]', scripts => scripts.map(node => node.getAttribute('src')))
    expect(scripts.some(src => src.includes('hello1.js'))).toBe(true)
    expect(scripts.some(src => src.includes('hello2.js'))).toBe(false)
  })

  it('should only render one bundle if component is used multiple times', async () => {
    const html = await server.fetchHTML('/dynamic/multiple-modules')
    expect(html.match(/chunks[\\/]hello1\.js/g).length).toBe(2) // one for preload, one for the script tag
    expect(html).not.toMatch(/hello2\.js/)
  })
})

describe('Import mapping', () => {
  it('should render dynamic imports bundle', async () => {
    const $ = await server.fetch$('/dynamic/bundle')
    const bodyText = $('body').text()
    expect(/Dynamic Bundle/.test(bodyText)).toBe(true)
    expect(/Hello World 1/.test(bodyText)).toBe(true)
    expect(/Hello World 2/.test(bodyText)).toBe(false)
  })

  it('should render dynamic imports bundle with additional components', async () => {
    const $ = await server.fetch$('/dynamic/bundle?showMore=1')
    const bodyText = $('body').text()
    expect(/Dynamic Bundle/.test(bodyText)).toBe(true)
    expect(/Hello World 1/.test(bodyText)).toBe(true)
    expect(/Hello World 2/.test(bodyText)).toBe(true)
  })

  it('should render components', async () => {
    await page.goto(server.getURL('/dynamic/bundle'))
    await Promise.all([
      expect(page).toMatch('Hello World 1'),
      expect(page).toMatch('Dynamic Bundle'),
      expect(page).not.toMatch('Hello World 2')
    ])
  })

  it('should render support React context', async () => {
    await page.goto(server.getURL('/dynamic/bundle'))
    await expect(page).toMatch('ZEIT Rocks')
  })

  it('should load new components and render for prop changes', async () => {
    await page.goto(server.getURL('/dynamic/bundle'))
    await expect(page).toMatchElement('#toggle-show-more')
    await expect(page).toClick('#toggle-show-more')
    await Promise.all([
      expect(page).toMatch('Hello World 1'),
      expect(page).toMatch('Dynamic Bundle'),
      expect(page).toMatch('Hello World 2')
    ])
  })
})
