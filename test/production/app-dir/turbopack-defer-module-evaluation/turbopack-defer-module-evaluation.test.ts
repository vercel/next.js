import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

type Result = {
  values: (string | null)[]
  evaluated: { before: string[]; after: string[] }
}

function count(names: string[], name: string) {
  return names.filter((n) => n === name).length
}

describe.each([
  { turbopackDeferModuleEvaluation: true },
  { turbopackDeferModuleEvaluation: false },
])(
  'turbopackDeferModuleEvaluation: $turbopackDeferModuleEvaluation',
  ({ turbopackDeferModuleEvaluation }) => {
    const { next, isTurbopack } = nextTestSetup({
      files: __dirname,
      env: {
        TEST_DEFER_MODULE_EVALUATION: String(turbopackDeferModuleEvaluation),
      },
    })
    // Other bundlers evaluate every import before the module that imports it.
    const deferred = turbopackDeferModuleEvaluation && isTurbopack

    // Every kind of server entry imports a module of a package that declares
    // `sideEffects: false` and a module with a side effect that nothing declares. It reads the
    // first one only for a request with `?use`.
    async function check(kind: string, get: (use: boolean) => Promise<Result>) {
      const declared = `declared:${kind}`
      const undeclared = `undeclared:${kind}`

      const first = await get(false)
      // The responses are the same with and without the option.
      expect(first.values).toEqual([undeclared, null])
      // The module with a side effect was evaluated before the entry handled a request.
      expect(count(first.evaluated.before, undeclared)).toBe(1)
      // With the option, nothing read an export of the declared module yet.
      expect(count(first.evaluated.after, declared)).toBe(deferred ? 0 : 1)

      const second = await get(true)
      expect(second.values).toEqual([undeclared, declared])
      expect(count(second.evaluated.before, declared)).toBe(deferred ? 0 : 1)
      expect(count(second.evaluated.after, declared)).toBe(1)

      // Both modules are evaluated once.
      const third = await get(true)
      expect(third.values).toEqual([undeclared, declared])
      expect(count(third.evaluated.after, declared)).toBe(1)
      expect(count(third.evaluated.after, undeclared)).toBe(1)
    }

    const json = async (path: string) => (await next.fetch(path)).json()
    const html = async (path: string) =>
      JSON.parse((await next.render$(path))('#result').text())

    it('evaluates a declared module on first use in an App Router route handler', async () => {
      await check('route', (use) =>
        json(use ? '/api/modules?use' : '/api/modules')
      )
    })

    it('evaluates a declared module on first use in an App Router page', async () => {
      await check('page', (use) => html(use ? '/?use' : '/'))
    })

    it('evaluates a declared module on first use in a Pages Router page', async () => {
      await check('pages-page', (use) =>
        html(use ? '/pages-router?use' : '/pages-router')
      )
    })

    it('evaluates a declared module on first use in a Pages Router API route', async () => {
      await check('pages-api', (use) =>
        json(use ? '/api/pages-modules?use' : '/api/pages-modules')
      )
    })

    it('evaluates a declared module on first use in the proxy', async () => {
      await check('proxy', (use) => json(use ? '/proxy?use' : '/proxy'))
    })

    it('runs the instrumentation hook before a request', async () => {
      const result: Result = await json('/api/modules')
      expect(count(result.evaluated.before, 'instrumentation')).toBe(1)
    })

    // Without the option a module is evaluated when its route is loaded, before the route
    // handles the request. With it, the first read of the module happens inside the request.

    it('evaluates a declared module outside the async context of the request that first uses it', async () => {
      for (const id of ['1', '2', '3']) {
        expect(await json(`/api/async-context?id=${id}`)).toEqual({
          atEvaluation: null,
          snapshot: null,
          bound: null,
          timer: null,
          asyncFunction: null,
        })
      }
    })

    it('evaluates a declared module outside the async context of the request that first imports it with import()', async () => {
      for (const id of ['1', '2']) {
        expect(await json(`/api/async-context-import?id=${id}`)).toEqual({
          imported: null,
          read: null,
        })
      }
    })

    it('evaluates the modules of a page that no import defers inside the request that first renders it', async () => {
      // The page reads a declared module at its top level, and the only other import of that
      // module is in an export that nothing uses. A page is loaded when a request first renders
      // it, so the three modules see the route of that request, with and without the option.
      expect(await html('/request-stores')).toEqual([
        '/request-stores',
        '/request-stores',
        '/request-stores',
      ])
    })

    it('serves a route whose first import of an import cycle is only read in its handler', async () => {
      // `format` has no side effect and the route reads it in its handler. It is the first
      // module that imports the cycle of `constants` and `config`, where `constants` reads
      // `config` while it is evaluated. The route also imports `config`, so the cycle only
      // works when `format` is evaluated before the route, with and without the option.
      const response = await next.fetch('/api/import-cycle')
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        formatted: 'x:de,en',
        supported: true,
      })
    })

    it('prerenders a page that uses a declared module which fetches when it is evaluated', async () => {
      const response = await next.fetch('/fetch-at-evaluation')
      expect(response.headers.get('x-nextjs-cache')).toBe('HIT')
      expect(await response.text()).toContain('<p id="fetched">fetched</p>')
    })

    // Server actions, client references and "use cache" functions are registered when their
    // module is evaluated. The `declared` ones are in the package with `sideEffects: false`.

    it('renders a client component that calls server actions', async () => {
      const browser = await next.browser('/')
      await retry(async () => {
        await browser.elementByCss('#run-action').click()
        expect(await browser.elementByCss('#action-result').text()).toBe(
          'action:client'
        )
      })
      await retry(async () => {
        await browser.elementByCss('#run-declared-action').click()
        expect(
          await browser.elementByCss('#declared-action-result').text()
        ).toBe('declared-action:client')
      })
    })

    it('caches the results of functions with "use cache"', async () => {
      const first = await next.render$('/')
      const second = await next.render$('/')
      for (const id of ['#cached', '#declared-cached']) {
        expect(first(id).text()).toMatch(/cached:0\.\d+$/)
        expect(second(id).text()).toBe(first(id).text())
      }
    })
  }
)
