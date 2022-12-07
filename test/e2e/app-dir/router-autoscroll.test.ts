import path from 'path'
import fs from 'fs-extra'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import cheerio from 'cheerio'

describe('router autoscrolling on navigation', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: new FileRef(path.join(__dirname, './router-autoscroll')),
      dependencies: {
        react: 'latest',
        'react-dom': 'latest',
        typescript: 'latest',
      },
    })
  })
  afterAll(() => next.destroy())

  const isReact17 = process.env.NEXT_TEST_REACT_VERSION === '^17'
  if (isReact17) {
    it('should skip tests for react 17', () => {})
    return
  }

  it('should scroll page into view on navigation', async () => {
    let hasFlightRequest = false
    let requestsCount = 0
    await webdriver(next.url, '/root', {
      beforePageLoad(page) {
        page.on('request', (request) => {
          requestsCount++
          return request.allHeaders().then((headers) => {
            if (
              headers['RSC'.toLowerCase()] === '1' &&
              // Prefetches also include `RSC`
              headers['Next-Router-Prefetch'.toLowerCase()] !== '1'
            ) {
              hasFlightRequest = true
            }
          })
        })
      },
    })

    expect(requestsCount).toBeGreaterThan(0)
    expect(hasFlightRequest).toBe(false)
  })
})
