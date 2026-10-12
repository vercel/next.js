import { get } from 'node:http'
import { expect } from 'vitest'
import { chromium } from 'playwright'

const visitors = [
  ['Alice', 'fr'],
  ['Bob', 'de'],
  ['Guest', 'en'],
]

// Exercise real rendered pages and API responses across warmed and overlapping
// requests. A cached identity or constant response must fail this contract.
export async function verifyHttp(url: string): Promise<void> {
  const visit = async ([name, language]: string[]) => {
    const headers: Record<string, string> = {}
    if (name !== 'Guest') {
      headers.cookie = `member=${name}`
    }
    if (language !== 'en') {
      headers['accept-language'] = language
    }
    // node:http preserves truly absent headers; fetch inserts accept-language: *.
    const request = (
      path: string
    ): Promise<{ status: number | undefined; text: string }> =>
      new Promise((resolve, reject) => {
        const req = get(path, { headers, timeout: 15000 }, (response) => {
          let text = ''
          response.on('data', (chunk) => {
            text += chunk.toString()
          })
          response.on('end', () =>
            resolve({ status: response.statusCode, text })
          )
          response.on('error', reject)
        })
        req.on('error', reject)
        req.on('timeout', () =>
          req.destroy(new Error('HTTP behavior request timed out'))
        )
      })
    const [page, api] = await Promise.all([
      request(url),
      request(`${url}/api/viewer`),
    ])
    expect(page.status).toBe(200)
    expect(api.status).toBe(200)
    expect(page.text).toContain(`id="member">${name}<`)
    expect(page.text).toContain(`id="language">${language}<`)
    expect(JSON.parse(api.text)).toEqual({ name, language })
  }
  for (const visitor of visitors) {
    await visit(visitor)
  }
  for (let round = 0; round < 3; round++) {
    await Promise.all(visitors.map(visit))
  }
  for (const visitor of [...visitors].reverse()) {
    await visit(visitor)
  }
}

export async function verifyBrowser(url: string): Promise<void> {
  const browser = await chromium.launch({ args: ['--no-sandbox'] })
  try {
    await Promise.all(
      visitors.map(async ([name, language]) => {
        const context = await browser.newContext({
          extraHTTPHeaders: { 'accept-language': language },
        })
        try {
          if (name !== 'Guest') {
            await context.addCookies([{ name: 'member', value: name, url }])
          }
          const page = await context.newPage()
          const errors: string[] = []
          page.on('pageerror', (error) => errors.push(error.message))
          for (let round = 0; round < 2; round++) {
            const response = await page.goto(url)
            expect(response?.status()).toBe(200)
            expect(await page.locator('#member').textContent()).toBe(name)
            expect(await page.locator('#language').textContent()).toBe(language)
            const api = await context.request.get(`${url}/api/viewer`)
            expect(await api.json()).toEqual({ name, language })
          }
          expect(errors).toEqual([])
        } finally {
          await context.close()
        }
      })
    )
  } finally {
    await browser.close()
  }
}
