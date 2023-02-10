import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - hooks',
  {
    files: __dirname,
    dependencies: {
      swr: 'latest',
      react: 'latest',
      'react-dom': 'latest',
      sass: 'latest',
    },
  },
  ({ next, isNextDeploy }) => {
    describe('from pages', () => {
      it.each([
        { pathname: '/adapter-hooks/static' },
        { pathname: '/adapter-hooks/1' },
        { pathname: '/adapter-hooks/2' },
        { pathname: '/adapter-hooks/1/account' },
        { pathname: '/adapter-hooks/static', keyValue: 'value' },
        { pathname: '/adapter-hooks/1', keyValue: 'value' },
        { pathname: '/adapter-hooks/2', keyValue: 'value' },
        { pathname: '/adapter-hooks/1/account', keyValue: 'value' },
      ])(
        'should have the correct hooks',
        async ({ pathname, keyValue = '' }) => {
          const browser = await next.browser(
            pathname + (keyValue ? `?key=${keyValue}` : '')
          )

          try {
            await browser.waitForElementByCss('#router-ready')
            expect(await browser.elementById('key-value').text()).toBe(keyValue)
            expect(await browser.elementById('pathname').text()).toBe(pathname)

            await browser.elementByCss('button').click()
            await browser.waitForElementByCss('#pushed')
          } finally {
            await browser.close()
          }
        }
      )
    })

    describe('usePathname', () => {
      it('should have the correct pathname', async () => {
        const $ = await next.render$('/hooks/use-pathname')
        expect($('#pathname').attr('data-pathname')).toBe('/hooks/use-pathname')
      })

      it('should have the canonical url pathname on rewrite', async () => {
        const $ = await next.render$('/rewritten-use-pathname')
        expect($('#pathname').attr('data-pathname')).toBe(
          '/rewritten-use-pathname'
        )
      })
    })

    describe('useSearchParams', () => {
      it('should have the correct search params', async () => {
        const $ = await next.render$(
          '/hooks/use-search-params?first=value&second=other%20value&third'
        )
        expect($('#params-first').text()).toBe('value')
        expect($('#params-second').text()).toBe('other value')
        expect($('#params-third').text()).toBe('')
        expect($('#params-not-real').text()).toBe('N/A')
      })

      // TODO-APP: correct this behavior when deployed
      if (!isNextDeploy) {
        it('should have the canonical url search params on rewrite', async () => {
          const $ = await next.render$(
            '/rewritten-use-search-params?first=a&second=b&third=c'
          )
          expect($('#params-first').text()).toBe('a')
          expect($('#params-second').text()).toBe('b')
          expect($('#params-third').text()).toBe('c')
          expect($('#params-not-real').text()).toBe('N/A')
        })
      }
    })

    describe('useRouter', () => {
      it('should allow access to the router', async () => {
        const browser = await next.browser('/hooks/use-router')

        try {
          // Wait for the page to load, click the button (which uses a method
          // on the router) and then wait for the correct page to load.
          await browser.waitForElementByCss('#router')
          await browser.elementById('button-push').click()
          await browser.waitForElementByCss('#router-sub-page')

          // Go back (confirming we did do a hard push), and wait for the
          // correct previous page.
          await browser.back()
          await browser.waitForElementByCss('#router')
        } finally {
          await browser.close()
        }
      })
    })

    describe('useSelectedLayoutSegments', () => {
      it.each`
        path                                                           | outerLayout                                             | innerLayout
        ${'/hooks/use-selected-layout-segment/first'}                  | ${['first']}                                            | ${[]}
        ${'/hooks/use-selected-layout-segment/first/slug1'}            | ${['first', 'slug1']}                                   | ${['slug1']}
        ${'/hooks/use-selected-layout-segment/first/slug2/second'}     | ${['first', 'slug2', '(group)', 'second']}              | ${['slug2', '(group)', 'second']}
        ${'/hooks/use-selected-layout-segment/first/slug2/second/a/b'} | ${['first', 'slug2', '(group)', 'second', 'a/b']}       | ${['slug2', '(group)', 'second', 'a/b']}
        ${'/hooks/use-selected-layout-segment/rewritten'}              | ${['first', 'slug3', '(group)', 'second', 'catch/all']} | ${['slug3', '(group)', 'second', 'catch/all']}
        ${'/hooks/use-selected-layout-segment/rewritten-middleware'}   | ${['first', 'slug3', '(group)', 'second', 'catch/all']} | ${['slug3', '(group)', 'second', 'catch/all']}
      `(
        'should have the correct layout segments at $path',
        async ({ path, outerLayout, innerLayout }) => {
          const $ = await next.render$(path)

          expect(JSON.parse($('#outer-layout').text())).toEqual(outerLayout)
          expect(JSON.parse($('#inner-layout').text())).toEqual(innerLayout)
        }
      )

      it('should return an empty array in pages', async () => {
        const $ = await next.render$(
          '/hooks/use-selected-layout-segment/first/slug2/second/a/b'
        )

        expect(JSON.parse($('#page-layout-segments').text())).toEqual([])
      })
    })

    describe('useSelectedLayoutSegment', () => {
      it.each`
        path                                                           | outerLayout | innerLayout
        ${'/hooks/use-selected-layout-segment/first'}                  | ${'first'}  | ${null}
        ${'/hooks/use-selected-layout-segment/first/slug1'}            | ${'first'}  | ${'slug1'}
        ${'/hooks/use-selected-layout-segment/first/slug2/second/a/b'} | ${'first'}  | ${'slug2'}
      `(
        'should have the correct layout segment at $path',
        async ({ path, outerLayout, innerLayout }) => {
          const $ = await next.render$(path)

          expect(JSON.parse($('#outer-layout-segment').text())).toEqual(
            outerLayout
          )
          expect(JSON.parse($('#inner-layout-segment').text())).toEqual(
            innerLayout
          )
        }
      )

      it('should return null in pages', async () => {
        const $ = await next.render$(
          '/hooks/use-selected-layout-segment/first/slug2/second/a/b'
        )

        expect(JSON.parse($('#page-layout-segment').text())).toEqual(null)
      })
    })
  }
)
