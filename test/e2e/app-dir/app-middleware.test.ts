/* eslint-env jest */

import { NextInstance, NextInstanceOpts } from 'test/lib/next-modes/base'
import { fetchViaHTTP } from 'next-test-utils'
import { createNext, FileRef } from 'e2e-utils'
import cheerio from 'cheerio'
import path from 'path'

const baseAppMiddlewareOptions: Partial<NextInstanceOpts> = {
  dependencies: {
    react: 'experimental',
    'react-dom': 'experimental',
  },
}

const makeNextWithAppPlusAPIFolder = () =>
  createNext({
    ...baseAppMiddlewareOptions,
    files: new FileRef(path.join(__dirname, 'app-middleware')),
  })

const makeNextWithAppFolderOnly = () =>
  createNext({
    ...baseAppMiddlewareOptions,
    files: new FileRef(path.join(__dirname, 'app-middleware-without-pages')),
  })

type AppMiddlewareUseCase = {
  title: string
  path: string
  toJson: (res: Response) => Promise<unknown>
}

const apiUseCases: AppMiddlewareUseCase[] = [
  {
    title: 'Serverless Functions',
    path: '/api/dump-headers-serverless',
    toJson: (res: Response) => res.json(),
  },
  {
    title: 'Edge Functions',
    path: '/api/dump-headers-edge',
    toJson: (res: Response) => res.json(),
  },
]

const appFolderUseCases: AppMiddlewareUseCase[] = [
  {
    title: 'next/headers',
    path: '/headers',
    toJson: async (res: Response) => {
      const $ = cheerio.load(await res.text())
      return JSON.parse($('#headers').text())
    },
  },
]

describe('app-dir with middleware', () => {
  if ((global as any).isNextDeploy) {
    it('should skip next deploy for now', () => {})
    return
  }

  describe.each([
    {
      title: 'with app and pages/api folder',
      useCases: [...apiUseCases, ...appFolderUseCases],
      factory: makeNextWithAppPlusAPIFolder,
    },
    {
      title: 'only with app folder',
      useCases: appFolderUseCases,
      factory: makeNextWithAppFolderOnly,
    },
  ])('Mutate request headers', ({ title, useCases, factory }) => {
    let nextInstance: NextInstance

    beforeAll(async () => {
      const newInstance = await factory()

      nextInstance = newInstance
    })
    afterAll(() => {
      nextInstance.destroy()
    })

    it.each(useCases)(
      `Adds new headers ${title}`,
      async ({ title, path, toJson }) => {
        console.debug(title)

        const res = await fetchViaHTTP(nextInstance.url, path, null, {
          headers: {
            'x-from-client': 'hello-from-client',
          },
        })

        expect(await toJson(res)).toMatchObject({
          'x-from-client': 'hello-from-client',
          'x-from-middleware': 'hello-from-middleware',
        })
      }
    )

    it.each(useCases)(
      `Deletes headers ${title}`,
      async ({ title, path, toJson }) => {
        console.debug(title)

        const res = await fetchViaHTTP(
          nextInstance.url,
          path,
          {
            'remove-headers': 'x-from-client1,x-from-client2',
          },
          {
            headers: {
              'x-from-client1': 'hello-from-client',
              'X-From-Client2': 'hello-from-client',
            },
          }
        )

        const json = await toJson(res)
        expect(json).not.toHaveProperty('x-from-client1')
        expect(json).not.toHaveProperty('X-From-Client2')
        expect(json).toMatchObject({
          'x-from-middleware': 'hello-from-middleware',
        })

        // Should not be included in response headers.
        expect(res.headers.get('x-middleware-override-headers')).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-middleware')
        ).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-client1')
        ).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-client2')
        ).toBeNull()
      }
    )

    it.each(useCases)(
      `Updates headers ${title}`,
      async ({ title, path, toJson }) => {
        console.debug(title)

        const res = await fetchViaHTTP(
          nextInstance.url,
          path,
          {
            'update-headers':
              'x-from-client1=new-value1,x-from-client2=new-value2',
          },
          {
            headers: {
              'x-from-client1': 'old-value1',
              'X-From-Client2': 'old-value2',
              'x-from-client3': 'old-value3',
            },
          }
        )
        expect(await toJson(res)).toMatchObject({
          'x-from-client1': 'new-value1',
          'x-from-client2': 'new-value2',
          'x-from-client3': 'old-value3',
          'x-from-middleware': 'hello-from-middleware',
        })

        // Should not be included in response headers.
        expect(res.headers.get('x-middleware-override-headers')).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-middleware')
        ).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-client1')
        ).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-client2')
        ).toBeNull()
        expect(
          res.headers.get('x-middleware-request-x-from-client3')
        ).toBeNull()
      }
    )
  })
})
