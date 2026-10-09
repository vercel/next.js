// Fixture-only observation of the actual public CLI. No product flags or hooks.
const { appendFileSync, realpathSync } = require('node:fs')
const { createRequire, Module } = require('node:module')
const { join } = require('node:path')

if (
  process.env.NEXT_TEST_EVENT_AUDIT &&
  /[/\\]dist[/\\]bin[/\\]next(?:\.js)?$/.test(process.argv[1] ?? '')
) {
  const installed = createRequire(join(process.cwd(), 'package.json'))
  const cli = installed.resolve('next/dist/bin/next')
  if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(cli)) {
    const targets = new Map([
      [
        installed.resolve('next/dist/experimental/testing/orchestrator'),
        'runTests',
      ],
      [
        installed.resolve('next/dist/experimental/testing/watch-orchestrator'),
        'watchTests',
      ],
    ])
    const load = Module._load
    const proxies = new WeakMap()
    Module._load = function (request, parent, isMain) {
      const value = load.apply(this, arguments)
      const name = targets.get(Module._resolveFilename(request, parent, isMain))
      if (!name) return value
      if (!proxies.has(value)) {
        const run = value[name]
        const wrapped = function (...args) {
          const optionsIndex = name === 'runTests' ? 2 : 1
          const options = args[optionsIndex] ?? {}
          args[optionsIndex] = {
            ...options,
            onEvent(event) {
              appendFileSync(
                process.env.NEXT_TEST_EVENT_AUDIT,
                JSON.stringify(event) + '\n'
              )
              options.onEvent?.(event)
            },
          }
          return Reflect.apply(run, this, args)
        }
        proxies.set(
          value,
          new Proxy(value, {
            get(target, property, receiver) {
              return property === name
                ? wrapped
                : Reflect.get(target, property, receiver)
            },
          })
        )
      }
      return proxies.get(value)
    }
  }
}
