import { createNextDescribe } from 'e2e-utils'
import { check } from 'next-test-utils'
import { Request } from 'playwright-chromium'

createNextDescribe(
  'app-dir action handling',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next, isNextDev }) => {
    it('should handle basic actions correctly', async () => {
      const browser = await next.browser('/server')

      const cnt = await browser.elementByCss('h1').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '1')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '2')

      await browser.elementByCss('#double').click()
      await check(() => browser.elementByCss('h1').text(), '4')

      await browser.elementByCss('#dec').click()
      await check(() => browser.elementByCss('h1').text(), '3')
    })

    it('should support headers and cookies', async () => {
      const browser = await next.browser('/header')

      await browser.elementByCss('#cookie').click()
      await check(async () => {
        const res = (await browser.elementByCss('h1').text()) || ''
        const id = res.split(':')
        return id[0] === id[1] && id[0] ? 'same' : 'different'
      }, 'same')

      await browser.elementByCss('#header').click()
      await check(async () => {
        const res = (await browser.elementByCss('h1').text()) || ''
        return res.includes('Mozilla') ? 'UA' : ''
      }, 'UA')

      // Set cookies
      await browser.elementByCss('#setCookie').click()
      await check(async () => {
        const res = (await browser.elementByCss('h1').text()) || ''
        const id = res.split(':')
        return id[0] === id[1] && id[0] === id[2] && id[0]
          ? 'same'
          : 'different'
      }, 'same')
    })

    it('should support setting cookies in route handlers with the correct overrides', async () => {
      const res = await next.fetch('/handler')
      const setCookieHeader = res.headers.get('set-cookie') as string[]
      expect(setCookieHeader).toContain('bar=bar2; Path=/')
      expect(setCookieHeader).toContain('baz=baz2; Path=/')
      expect(setCookieHeader).toContain('foo=foo1; Path=/')
      expect(setCookieHeader).toContain('test1=value1; Path=/; Secure')
      expect(setCookieHeader).toContain('test2=value2; Path=/handler; HttpOnly')
    })

    it('should support formData and redirect', async () => {
      const browser = await next.browser('/server')

      await browser.eval(`document.getElementById('name').value = 'test'`)
      await browser.elementByCss('#submit').click()

      await check(() => {
        return browser.eval('window.location.pathname + window.location.search')
      }, '/header?name=test&constructor=FormData')
    })

    it('should support notFound', async () => {
      const browser = await next.browser('/server')

      await browser.elementByCss('#nowhere').click()

      await check(() => {
        return browser.elementByCss('h1').text()
      }, 'my-not-found')
    })

    it('should support uploading files', async () => {
      const logs: string[] = []
      next.on('stdout', (log) => {
        logs.push(log)
      })
      next.on('stderr', (log) => {
        logs.push(log)
      })

      const browser = await next.browser('/server')

      // Fake a file to upload
      await browser.eval(`
        const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
        const list = new DataTransfer();
        list.items.add(file);
        document.getElementById('file').files = list.files;
      `)

      await browser.elementByCss('#upload').click()

      await check(() => {
        return logs.some((log) => log.includes('File name: hello.txt size: 5'))
          ? 'yes'
          : ''
      }, 'yes')
    })

    it('should support hoc auth wrappers', async () => {
      const browser = await next.browser('/header')
      await await browser.eval(`document.cookie = 'auth=0'`)

      await browser.elementByCss('#authed').click()

      await check(() => {
        return browser.elementByCss('h1').text()
      }, 'Error: Unauthorized request')

      await await browser.eval(`document.cookie = 'auth=1'`)

      await browser.elementByCss('#authed').click()

      await check(() => {
        return browser.elementByCss('h1').text()
      }, 'Prefix: HELLO, WORLD')
    })

    it('should support importing actions in client components', async () => {
      const browser = await next.browser('/client')

      const cnt = await browser.elementByCss('h1').text()
      expect(cnt).toBe('0')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '1')

      await browser.elementByCss('#inc').click()
      await check(() => browser.elementByCss('h1').text(), '2')

      await browser.elementByCss('#double').click()
      await check(() => browser.elementByCss('h1').text(), '4')

      await browser.elementByCss('#dec').click()
      await check(() => browser.elementByCss('h1').text(), '3')
    })

    if (isNextDev) {
      describe('HMR', () => {
        it('should support updating the action', async () => {
          const filePath = 'app/server/actions.js'
          const origContent = await next.readFile(filePath)

          try {
            const browser = await next.browser('/server')

            const cnt = await browser.elementByCss('h1').text()
            expect(cnt).toBe('0')

            await browser.elementByCss('#inc').click()
            await check(() => browser.elementByCss('h1').text(), '1')

            await next.patchFile(
              filePath,
              origContent.replace('return value + 1', 'return value + 1000')
            )

            await browser.elementByCss('#inc').click()
            await check(() => browser.elementByCss('h1').text(), '1001')
          } finally {
            await next.patchFile(filePath, origContent)
          }
        })
      })
    }

    describe('Edge SSR', () => {
      it('should handle basic actions correctly', async () => {
        const browser = await next.browser('/server/edge')

        const cnt = await browser.elementByCss('h1').text()
        expect(cnt).toBe('0')

        await browser.elementByCss('#inc').click()
        await check(() => browser.elementByCss('h1').text(), '1')

        await browser.elementByCss('#inc').click()
        await check(() => browser.elementByCss('h1').text(), '2')

        await browser.elementByCss('#double').click()
        await check(() => browser.elementByCss('h1').text(), '4')

        await browser.elementByCss('#dec').click()
        await check(() => browser.elementByCss('h1').text(), '3')
      })
    })

    describe('fetch actions', () => {
      it('should handle redirect to a relative URL in a single pass', async () => {
        const browser = await next.browser('/client')

        // wait for network idle
        await browser.waitForIdleNetwork()

        let requests = []

        browser.on('request', (req: Request) => {
          requests.push(new URL(req.url()).pathname)
        })

        await browser.elementByCss('#redirect').click()

        // no other requests should be made
        expect(requests).toEqual(['/client'])
      })

      it('should handle regular redirects', async () => {
        const browser = await next.browser('/client')

        await browser.elementByCss('#redirect-external').click()

        await check(async () => {
          return browser.eval('window.location.toString()')
        }, 'https://example.com/')
      })

      it.skip('should handle revalidatePath', async () => {})

      it.skip('should handle revalidateTag', async () => {})
    })
  }
)
