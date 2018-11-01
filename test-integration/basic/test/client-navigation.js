/* eslint-env jest */
/* global browser, page, server */

import { getReactErrorOverlayContent } from 'puppet-helper'

describe('with <Link/>', () => {
  it('should navigate the page', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#about-link')
    await page.waitFor('.nav-about')
    await expect(page).toMatchElement('p', {
      text: 'This is the about page.'
    })
  })

  it('should navigate via the client side', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#increase')
    await expect(page).toClick('#about-link')
    await page.waitFor('.nav-about')
    await expect(page).toClick('#home-link')
    await page.waitFor('.nav-home')
    await expect(page).toMatchElement('#counter', {
      text: 'Counter: 1'
    })
  })
})

describe('With url property', () => {
  it('Should keep immutable pathname, asPath and query', async () => {
    await page.goto(server.getURL('/nav/url-prop-change'))
    await expect(page).toClick('#add-query')

    await expect(page).toMatchElement('#url-result', {
      text: '{"query":{"added":"yes"},"pathname":"/nav/url-prop-change","asPath":"/nav/url-prop-change?added=yes"}'
    })

    await expect(page).toMatchElement('#previous-url-result', {
      text: '{"query":{},"pathname":"/nav/url-prop-change","asPath":"/nav/url-prop-change"}'
    })
  })
})

describe('with <a/> tag inside the <Link />', () => {
  it('should navigate the page', async () => {
    await page.goto(server.getURL('/nav/about'))
    await expect(page).toClick('#home-link')
    await expect(page).toMatchElement('.nav-home', {
      text: 'This is the home.'
    })
  })

  it('should not navigate if the <a/> tag has a target', async () => {
    await browser.once('targetcreated', async (target) => {
      const page = await target.page()
      page.close()
    })
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#increase')
    await expect(page).toClick('#target-link')
    await expect(page).toMatchElement('#counter', {
      text: 'Counter: 1'
    })
  })
})

describe('with unexpected <a/> nested tag', () => {
  it('should not redirect if passHref prop is not defined in Link', async () => {
    await page.goto(server.getURL('/nav/pass-href-prop'))
    await expect(page).toClick('#without-href')
    await page.waitFor('.nav-pass-href-prop')
    await expect(page).toMatchElement('p', {
      text: 'This is the passHref prop page.'
    })
  })

  it('should redirect if passHref prop is defined in Link', async () => {
    await page.goto(server.getURL('/nav/pass-href-prop'))
    await expect(page).toClick('#with-href')
    await page.waitFor('.nav-home')
    await expect(page).toMatchElement('p', {
      text: 'This is the home.'
    })
  })
})

describe('with empty getInitialProps()', () => {
  it('should render an error', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#empty-props')
    const errorOverlayContent = await getReactErrorOverlayContent(page)
    expect(errorOverlayContent).toMatch(/should resolve to an object\. But found "null" instead\./)
    await page.close()
  })
})

describe('with the same page but different querystring', () => {
  it('should navigate the page', async () => {
    await page.goto(server.getURL('/nav/querystring?id=1'))
    await expect(page).toClick('#next-id-link')
    await page.waitFor('.nav-id-2')
    await expect(page).toMatchElement('p', {
      text: '2'
    })
  })

  it('should remove querystring', async () => {
    await page.goto(server.getURL('/nav/querystring?id=1'))
    await expect(page).toClick('#main-page')
    await page.waitFor('.nav-id-0')
    await expect(page).toMatchElement('p', {
      text: '0'
    })
  })
})

describe('with the current url', () => {
  it('should reload the page', async () => {
    await page.goto(server.getURL('/nav/self-reload'))
    await expect(page).toMatchElement('p', {
      text: 'COUNT: 0'
    })
    await expect(page).toClick('#self-reload-link')
    await expect(page).toMatchElement('p', {
      text: 'COUNT: 1'
    })
  })

  it('should always replace the state', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#self-reload-link')
    await page.waitFor('#self-reload-page')
    await expect(page).toClick('#self-reload-link')
    await expect(page).toClick('#self-reload-link')
    await expect(page).toMatchElement('p', {
      text: 'COUNT: 3'
    })
    await page.goBack()
    await page.waitFor('.nav-home')
  })
})

describe('with onClick action', () => {
  it('should reload the page and perform additional action', async () => {
    await page.goto(server.getURL('/nav/on-click'))
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 0'
    })
    await expect(page).toMatchElement('#state-count', {
      text: 'STATE COUNT: 0'
    })
    await expect(page).toClick('#on-click-link')
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 1'
    })
    await expect(page).toMatchElement('#state-count', {
      text: 'STATE COUNT: 1'
    })
  })

  it('should not reload if default was prevented', async () => {
    await page.goto(server.getURL('/nav/on-click'))
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 0'
    })
    await expect(page).toMatchElement('#state-count', {
      text: 'STATE COUNT: 0'
    })
    await expect(page).toClick('#on-click-link-prevent-default')
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 0'
    })
    await expect(page).toMatchElement('#state-count', {
      text: 'STATE COUNT: 1'
    })
    await expect(page).toClick('#on-click-link')
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 1'
    })
    await expect(page).toMatchElement('#state-count', {
      text: 'STATE COUNT: 2'
    })
  })

  it('should always replace the state and perform additional action', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#on-click-link')
    await page.waitFor('#on-click-page')
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 1'
    })
    await expect(page).toClick('#on-click-link')
    await expect(page).toMatchElement('#query-count', {
      text: 'QUERY COUNT: 2'
    })
    await expect(page).toMatchElement('#state-count', {
      text: 'STATE COUNT: 1'
    })
    await page.goBack()
    await page.waitFor('.nav-home')
  })
})

describe('with hash changes', () => {
  describe('when hash change via Link', () => {
    it('should not run getInitialProps', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#via-link')
      await expect(page).toMatchElement('p', {
        text: 'COUNT: 0'
      })
    })

    it('should scroll to the specified position on the same page', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#scroll-to-item-400')
      /* istanbul ignore next */
      expect(await page.evaluate('window.pageYOffset')).toBe(7258)
      await expect(page).toClick('#via-empty-hash')
      /* istanbul ignore next */
      expect(await page.evaluate('window.pageYOffset')).toBe(0)
    })

    it('should scroll to the specified position on the same page with a name property', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#scroll-to-name-item-400')
      /* istanbul ignore next */
      expect(await page.evaluate('window.pageYOffset')).toBe(16258)
      await expect(page).toClick('#via-empty-hash')
      /* istanbul ignore next */
      expect(await page.evaluate('window.pageYOffset')).toBe(0)
    })

    it('should scroll to the specified position to a new page', async () => {
      await page.goto(server.getURL('/nav'))
      await expect(page).toClick('#scroll-to-hash')
      await page.waitFor('#hash-changes-page')
      /* istanbul ignore next */
      expect(await page.evaluate('window.pageYOffset')).toBe(7258)
    })
  })

  describe('when hash change via A tag', () => {
    it('should not run getInitialProps', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#via-a')
      await expect(page).toMatchElement('p', {
        text: 'COUNT: 0'
      })
    })
  })

  describe('when hash get removed', () => {
    it('should not run getInitialProps', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#via-a')
      await expect(page).toClick('#page-url')
      await expect(page).toMatchElement('p', {
        text: 'COUNT: 1'
      })
    })
  })

  describe('when hash set to empty', () => {
    it('should not run getInitialProps', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#via-a')
      await expect(page).toClick('#via-empty-hash')
      await expect(page).toMatchElement('p', {
        text: 'COUNT: 0'
      })
    })
  })

  describe('when hash changed to a different hash', () => {
    it('should not run getInitialProps', async () => {
      await page.goto(server.getURL('/nav/hash-changes'))
      await expect(page).toClick('#via-a')
      await expect(page).toClick('#via-link')
      await expect(page).toMatchElement('p', {
        text: 'COUNT: 0'
      })
    })
  })
})

describe('with shallow routing', () => {
  it('should update the url without running getInitialProps', async () => {
    await page.goto(server.getURL('/nav/shallow-routing'))
    await expect(page).toClick('#increase')
    await expect(page).toClick('#increase')
    await expect(page).toMatchElement('#counter', {
      text: 'Counter: 2'
    })
    await expect(page).toMatchElement('#get-initial-props-run-count', {
      text: 'getInitialProps run count: 1'
    })
  })

  it('should handle the back button and should not run getInitialProps', async () => {
    await page.goto(server.getURL('/nav/shallow-routing'))
    await expect(page).toClick('#increase')
    await expect(page).toClick('#increase')
    await expect(page).toMatchElement('#counter', {
      text: 'Counter: 2'
    })
    await page.goBack()
    await expect(page).toMatchElement('#counter', {
      text: 'Counter: 1'
    })
    await expect(page).toMatchElement('#get-initial-props-run-count', {
      text: 'getInitialProps run count: 1'
    })
  })

  it('should run getInitialProps always when rending the page to the screen', async () => {
    await page.goto(server.getURL('/nav/shallow-routing'))
    await expect(page).toClick('#increase')
    await expect(page).toClick('#increase')
    await expect(page).toClick('#home-link')
    await page.waitFor('.nav-home')
    await page.goBack()
    await page.waitFor('.shallow-routing')
    await expect(page).toMatchElement('#counter', {
      text: 'Counter: 2'
    })
    await expect(page).toMatchElement('#get-initial-props-run-count', {
      text: 'getInitialProps run count: 2'
    })
  })
})

describe('with URL objects', () => {
  it('should work with <Link/>', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#query-string-link')
    await page.waitFor('.nav-querystring')
    await expect(page).toMatchElement('p', {
      text: '10'
    })
    expect(await page.url()).toBe(server.getURL('/nav/querystring/10#10'))
  })

  it('should work with "Router.push"', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#query-string-button')
    await page.waitFor('.nav-querystring')
    await expect(page).toMatchElement('p', {
      text: '10'
    })
    expect(await page.url()).toBe(server.getURL('/nav/querystring/10#10'))
  })

  it('should work with the "replace" prop', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/nav'))

    // Navigation to /about using a replace link should maintain the url stack length
    await expect(page).toClick('#about-replace-link')
    await page.waitFor('.nav-about')
    await expect(page).toMatchElement('p', {
      text: 'This is the about page.'
    })
    /* istanbul ignore next */
    expect(await page.evaluate('window.history.length')).toBe(2)

    // Going back to the home with a regular link will augment the history count
    await expect(page).toClick('#home-link')
    await page.waitFor('.nav-home')
    /* istanbul ignore next */
    expect(await page.evaluate('window.history.length')).toBe(3)
    page.close()
  })
})

describe('with getInitialProp redirect', () => {
  it('should redirect the page via client side', async () => {
    await page.goto(server.getURL('/nav'))
    await expect(page).toClick('#redirect-link')
    await page.waitFor('.nav-about')
    await expect(page).toMatchElement('p', {
      text: 'This is the about page.'
    })
  })

  it('should redirect the page when loading', async () => {
    await page.goto(server.getURL('/nav/redirect'))
    await expect(page).toMatchElement('p', {
      text: 'This is the about page.'
    })
  })
})

describe('with different types of urls', () => {
  it('should work with normal page', async () => {
    await page.goto(server.getURL('/with-cdm'))
    await expect(page).toMatchElement('p', {
      text: 'ComponentDidMount executed on client.'
    })
  })

  it('should work with dir/ page', async () => {
    await page.goto(server.getURL('/nested-cdm'))
    await expect(page).toMatchElement('p', {
      text: 'ComponentDidMount executed on client.'
    })
  })

  it('should work with /index page', async () => {
    await page.goto(server.getURL('/index'))
    await expect(page).toMatchElement('p', {
      text: 'ComponentDidMount executed on client.'
    })
  })

  it('should work with / page', async () => {
    await page.goto(server.getURL('/'))
    await expect(page).toMatchElement('p', {
      text: 'ComponentDidMount executed on client.'
    })
  })
})

describe('with the HOC based router', () => {
  it('should navigate as expected', async () => {
    await page.goto(server.getURL('/nav/with-hoc'))
    await expect(page).toMatchElement('#pathname', {
      text: 'Current path: /nav/with-hoc'
    })
    await expect(page).toMatchElement('#asPath', {
      text: 'Current asPath: /nav/with-hoc'
    })

    await expect(page).toClick('.nav-with-hoc a')
    await expect(page).toMatchElement('p', {
      text: 'This is the home.'
    })
  })
})

describe('with asPath', () => {
  describe('inside getInitialProps', () => {
    it('should show the correct asPath with a Link with as prop', async () => {
      await page.goto(server.getURL('/nav'))
      await expect(page).toClick('#as-path-link')
      await expect(page).toMatchElement('.as-path-content', {
        text: '/as/path'
      })
    })

    it('should show the correct asPath with a Link without the as prop', async () => {
      await page.goto(server.getURL('/nav'))
      await expect(page).toClick('#as-path-link-no-as')
      await expect(page).toMatchElement('.as-path-content', {
        text: '/nav/as-path'
      })
    })
  })

  describe('with next/router', () => {
    it('should show the correct asPath', async () => {
      await page.goto(server.getURL('/nav'))
      await expect(page).toClick('#as-path-using-router-link')
      await expect(page).toMatchElement('.as-path-content', {
        text: '/nav/as-path-using-router'
      })
    })
  })

  describe('with next/link', () => {
    it('should use pushState with same href and different asPath', async () => {
      async function getJSONFromNode (page, selector) {
        const node = await page.$(selector)
        /* istanbul ignore next */
        const jsonString = await page.evaluate(e => e.textContent, node)
        return JSON.parse(jsonString)
      }

      await page.goto(server.getURL('/nav/as-path-pushstate'))
      await expect(page).toClick('#hello')
      await expect(page).toMatchElement('#something-hello')
      const routerQuery = await getJSONFromNode(page, '#router-query')
      await expect(routerQuery.something).toBe('hello')

      await expect(page).toClick('#same-query')
      await expect(page).toMatchElement('#something-same-query')
      const routerQuery2 = await getJSONFromNode(page, '#router-query')
      await expect(routerQuery2.something).toBe('hello')

      await page.goBack()
      await expect(page).toMatchElement('#something-hello')
      const routerQuery3 = await getJSONFromNode(page, '#router-query')
      await expect(routerQuery3.something).toBe('hello')
    })
  })
})

describe('runtime errors', () => {
  it('should show ErrorDebug when a client side error is thrown inside a component', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/error-inside-browser-page'))
    const text = await getReactErrorOverlayContent(page)
    expect(text).toMatch(/An Expected error occured/)
    expect(text).toMatch(/pages\/error-inside-browser-page\.js:5/)
    await page.close()
  })

  it('should show ErrorDebug when a client side error is thrown outside a component', async () => {
    const page = await browser.newPage()
    await page.goto(server.getURL('/error-in-the-browser-global-scope'))
    const text = await getReactErrorOverlayContent(page)
    expect(text).toMatch(/An Expected error occured/)
    expect(text).toMatch(/error-in-the-browser-global-scope\.js:2/)
    await page.close()
  })
})

describe('with 404 pages', () => {
  it('should 404 on not existent page', async () => {
    await page.goto(server.getURL('/non-existent'))
    await expect(page).toMatch('404')
    await expect(page).toMatch('This page could not be found.')
  })

  it('should 404 for <page>/', async () => {
    await page.goto(server.getURL('/nav/about/'))
    await expect(page).toMatch('404')
    await expect(page).toMatch('This page could not be found.')
  })

  it('should should not contain a page script in a 404 page', async () => {
    await page.goto(server.getURL('/non-existent'))

    /* istanbul ignore next */
    const hasPageScript = await page.$$eval('script[src]', scripts => scripts.some(
      script => script
        .getAttribute('src')
        .includes('/non-existent')
    ))
    expect(hasPageScript).toBeFalsy()
  })
})

describe('updating head while client routing', () => {
  it('should update head during client routing', async () => {
    await page.goto(server.getURL('/nav/head-1'))

    const meta1 = await expect(page).toMatchElement('meta[name="description"]')
    /* istanbul ignore next */
    const meta1Content = await page.evaluate(e => e.getAttribute('content'), meta1)
    expect(meta1Content).toBe('Head One')

    await expect(page).toClick('#to-head-2')
    await page.waitForSelector('#head-2')
    const meta2 = await expect(page).toMatchElement('meta[name="description"]')
    /* istanbul ignore next */
    const meta2Content = await page.evaluate(e => e.getAttribute('content'), meta2)
    expect(meta2Content).toBe('Head Two')

    await expect(page).toClick('#to-head-1')
    await page.waitForSelector('#head-1')
    const meta3 = await expect(page).toMatchElement('meta[name="description"]')
    /* istanbul ignore next */
    const meta3Content = await page.evaluate(e => e.getAttribute('content'), meta3)
    expect(meta3Content).toBe('Head One')
  })
})
