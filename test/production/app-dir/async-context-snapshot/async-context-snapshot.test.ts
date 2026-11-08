import fs from 'fs'
import { createRequire } from 'module'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Next.js restores the async context of a request in two places: every work
// store has `runInCleanSnapshot`, and the revalidations that are pending when
// the response closes run in the context of the request. In Node.js,
// `AsyncLocalStorage.snapshot()` and `AsyncLocalStorage.bind()` return a
// function from `AsyncResource.prototype.bind()`, which defines the deprecated
// `asyncResource` accessor on it. V8 keeps accessors in the old generation, so
// a minor garbage collection cannot free what the function captured: every
// async local store of the request. `instrumentation.ts` counts the calls of
// `AsyncResource.prototype.bind()`.
describe('async-context-snapshot', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  async function boundFunctions(): Promise<number> {
    const res = await next.fetch('/api/bound-functions')
    return (await res.json()).count
  }

  it('should not bind a function to an AsyncResource for a route handler', async () => {
    const before = await boundFunctions()
    const res = await next.fetch('/api/hello')
    expect(await res.json()).toEqual({ hello: 'world' })
    // Reading the count is a route handler request as well.
    expect((await boundFunctions()) - before).toBe(0)
  })

  it('should not bind a function to an AsyncResource for a page', async () => {
    const before = await boundFunctions()
    const html = await next.render('/')
    expect(html).toContain('hello world')
    expect((await boundFunctions()) - before).toBe(0)
  })

  it('should not bind a function to an AsyncResource for a server action', async () => {
    const browser = await next.browser('/action')
    const before = await boundFunctions()
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('#result').text()).toBe('done')
    })
    expect((await boundFunctions()) - before).toBe(0)
  })

  // `next/dynamic` in a client component makes the browser load the module
  // that creates the async local storages. The code that restores an async
  // context needs `node:async_hooks`, which a browser bundle cannot resolve,
  // so it must stay out of that module.
  it('should hydrate a client component that uses next/dynamic', async () => {
    const browser = await next.browser('/dynamic', {
      pushErrorAsConsoleLog: true,
    })
    await browser.elementByCss('button').click()
    await retry(async () => {
      expect(await browser.elementByCss('button').text()).toBe('1')
    })
    expect(await browser.elementByCss('#lazy').text()).toBe('lazy')
    const logs = await browser.log()
    expect(logs.filter((log) => log.source === 'error')).toEqual([])
  })

  it('should not reference async_hooks in the browser chunks', () => {
    const staticDir = path.join(next.testDir, next.distDir, 'static')
    const chunks = fs
      .readdirSync(staticDir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.js'))
    expect(chunks.length).toBeGreaterThan(0)
    expect(
      chunks.filter((file) =>
        fs
          .readFileSync(path.join(staticDir, file), 'utf8')
          .includes('async_hooks')
      )
    ).toEqual([])
  })

  // Adapters patch the compiled `async-local-storage.js`. `@opennextjs/cloudflare`
  // removes every `if` statement of the function declaration `createSnapshot`
  // in that file, so that a snapshot calls its callback in the context of the
  // caller. Its rule finds nothing if the function moves to another file or is
  // no longer a declaration, and it leaves a context in place that is captured
  // outside an `if` statement, or by the server-only module before it calls
  // that function.
  it('should keep createSnapshot in the shape that adapters patch', () => {
    // The patterns accept less than the rule handles: no call in the condition
    // of an `if`, no block that is nested twice, and no `try` statement.
    const shape = new RegExp(
      [
        // A function declaration, where a statement starts. The rule does not
        // look at a function expression or a method.
        /(?<=(?:^|[;{}])\s*)(?:export )?function createSnapshot\([^()]*\) \{/,
        // `if` statements, with a block that has at most one nested block or
        // with one statement without braces. The rule replaces each of them
        // with a line comment, so each must end its line, and nothing outside
        // of them may capture a context.
        /(?:if \([^()]*\) (?:\{(?:[^{}]|\{[^{}]*\})*\}|[^{};]*;)[^\S\n]*\n\s*)+/,
        // What is left calls the callback directly: a function expression
        // or an arrow function that only passes its arguments on.
        /return (?:function\s*)?\((\w+), \.\.\.(\w+)\)\s*(?:=>\s*)?(?:\{\s*return )?\1\(\.\.\.\2\);?\s*\}?;?/,
        /\}/,
      ]
        .map((part) => part.source)
        .join('\\s*')
    )
    // `createSnapshot` of the server-only module leaves the decision to that
    // function: it only passes the implementation for Node.js on.
    const passesOn =
      /(?<=(?:^|[;{}])\s*)(?:export )?function createSnapshot\(\) \{\s*return (?:\(0, \w+\.createSnapshot\)|createSnapshotWith)\(nodeSnapshotSource\);?\s*\}/
    const appRequire = createRequire(path.join(next.testDir, 'package.json'))
    const readWithoutComments = (file: string) =>
      fs
        .readFileSync(appRequire.resolve(file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
    // The CommonJS build and the ESM build of both files.
    for (const dist of ['next/dist', 'next/dist/esm']) {
      const dir = `${dist}/server/app-render`
      expect(readWithoutComments(`${dir}/async-local-storage`)).toMatch(shape)
      expect(readWithoutComments(`${dir}/async-context-snapshot`)).toMatch(
        passesOn
      )
    }
  })
})
