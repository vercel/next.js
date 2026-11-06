/* eslint-env jest */

import { nextTestSetup } from 'e2e-utils'
import type { Response } from 'node-fetch'

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })

const countHreflangLinks = (response: Response) => {
  const linkHeaders = response.headers.raw().link ?? []
  const combinedLinkHeader = linkHeaders.join(',')

  return combinedLinkHeader.match(/hreflang=/g)?.length ?? 0
}

describe('proxy Link header with Cache Components revalidation', () => {
  const { next, isNextDev, isNextDeploy } = nextTestSetup({
    files: __dirname,
  })

  const testIfProd = isNextDev || isNextDeploy ? it.skip : it

  testIfProd(
    'does not duplicate proxy Link headers after revalidation when next/font/local also emits preload links',
    async () => {
      const counts: number[] = []

      for (let cycle = 0; cycle < 3; cycle++) {
        if (cycle > 0) {
          await wait(6000)
        }

        const triggerResponse = await next.fetch('/ru')
        expect(triggerResponse.status).toBe(200)

        await wait(1000)

        const response = await next.fetch('/ru')
        expect(response.status).toBe(200)

        const linkHeader = response.headers.get('link')
        expect(linkHeader).toContain('hreflang="ru"')
        expect(linkHeader).toContain('rel=preload')

        counts.push(countHreflangLinks(response))
      }

      expect(counts).toEqual([4, 4, 4])
    }
  )
})
