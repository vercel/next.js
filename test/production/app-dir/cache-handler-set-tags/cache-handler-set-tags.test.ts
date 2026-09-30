import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

function getPageSetEntries(cliOutput: string) {
  return cliOutput
    .split('\n')
    .filter((line) => line.includes('test-cache-handler set '))
    .map((line) => JSON.parse(line.slice(line.indexOf('{'))))
    .filter((entry) => entry.kind === 'APP_PAGE')
}

describe('cache-handler-set-tags', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should pass tags to set for APP_PAGE entries, including implicit path tags', async () => {
    await next.render$('/')

    await retry(async () => {
      const pageSets = getPageSetEntries(next.cliOutput)
      expect(pageSets.length).toBeGreaterThan(0)

      const pageSet = pageSets[pageSets.length - 1]
      expect(pageSet.tags).toEqual(
        expect.arrayContaining([
          'explicit-tag',
          '_N_T_/layout',
          '_N_T_/page',
          '_N_T_/',
        ])
      )
    })
  })

  it('should serve fresh content after revalidatePath invalidates via the tag index', async () => {
    let initialNow: string

    await retry(async () => {
      const $ = await next.render$('/')
      initialNow = $('#now').text()
      expect(initialNow).not.toBe('')

      // Confirm the page is served from the custom cache handler.
      const $cached = await next.render$('/')
      expect($cached('#now').text()).toBe(initialNow)
    })

    const res = await next.fetch('/revalidate-path')
    expect((await res.json()).revalidated).toBe(true)

    await retry(async () => {
      const $fresh = await next.render$('/')
      expect($fresh('#now').text()).not.toBe(initialNow)
    })
  })
})
