/* eslint-env jest */
import webdriver from 'next-webdriver'
import cheerio from 'cheerio'
import { fetchViaHTTP, renderViaHTTP } from 'next-test-utils'

function getNodeBySelector(html, selector) {
  const $ = cheerio.load(html)
  return $(selector)
}

async function resolveStreamResponse(response, onData) {
  let result = ''
  onData = onData || (() => {})
  await new Promise((resolve) => {
    response.body.on('data', (chunk) => {
      result += chunk.toString()
      onData(chunk.toString(), result)
    })

    response.body.on('end', resolve)
  })
  return result
}

export default function (context, { env }) {
  it('should support streaming for fizz response', async () => {
    async function testStreamingResponse(pathname) {
      await fetchViaHTTP(context.appPort, pathname, null, {}).then(
        async (response) => {
          let gotFallback = false
          let gotData = false

          await resolveStreamResponse(response, (_, result) => {
            gotData = result.includes('next_streaming_data')
            if (!gotFallback) {
              gotFallback = result.includes('next_streaming_fallback')
              if (gotFallback) {
                expect(gotData).toBe(false)
              }
            }
          })

          // Streaming is disabled for pages, no fallback should be rendered.
          expect(gotFallback).toBe(false)
          expect(gotData).toBe(true)
        }
      )

      // Should end up with "next_streaming_data".
      const browser = await webdriver(context.appPort, pathname)
      const content = await browser.eval(`window.document.body.innerText`)
      expect(content).toMatchInlineSnapshot('"next_streaming_data"')
    }

    await testStreamingResponse('/streaming')
    await testStreamingResponse('/streaming-single-export')
  })

  it('should not stream to crawlers or google pagerender bot', async () => {
    const res1 = await fetchViaHTTP(
      context.appPort,
      '/streaming',
      {},
      {
        headers: {
          'user-agent': 'Googlebot',
        },
      }
    )

    const res2 = await fetchViaHTTP(
      context.appPort,
      '/streaming',
      {},
      {
        headers: {
          'user-agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/56.0.2924.87 Safari/537.36 Google-PageRenderer Google (+https://developers.google.com/+/web/snippet/)',
        },
      }
    )
    let flushCount = 0
    await resolveStreamResponse(res2, () => {
      flushCount++
    })
    expect(flushCount).toBe(1)
    const html = await res1.text()
    const body = await getNodeBySelector(html, '#__next')
    // Resolve data instead of fallback
    expect(body.text()).toBe('next_streaming_data')

    expect(res1.headers.get('etag')).toBeDefined()
    expect(res2.headers.get('etag')).toBeDefined()
  })

  it('should render 500 error correctly', async () => {
    const errPaths = ['/err', '/err/render']
    const promises = errPaths.map(async (pagePath) => {
      const html = await renderViaHTTP(context.appPort, pagePath)
      if (env === 'dev') {
        // In dev mode it should show the error popup.
        expect(html).toContain('Error: oops')
      } else {
        expect(html).toContain('custom-500-page')
      }
    })
    await Promise.all(promises)
  })

  it('should render fallback if error raised from suspense during streaming', async () => {
    const html = await renderViaHTTP(context.appPort, '/err/suspense')
    expect(html).toContain('error-fallback')
  })
}
