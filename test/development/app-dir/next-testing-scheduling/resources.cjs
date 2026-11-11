// Fixture-only observation of real owned processes; no runner implementation seams.
const cp = require('node:child_process')
const { appendFileSync } = require('node:fs')
const { basename } = require('node:path')
for (const method of ['fork', 'spawn']) {
  const original = cp[method]
  cp[method] = function (file, ...args) {
    const child = Reflect.apply(original, this, [file, ...args])
    if (child.pid && process.env.NEXT_SCHEDULING_RESOURCES) {
      appendFileSync(
        process.env.NEXT_SCHEDULING_RESOURCES,
        JSON.stringify({
          event: 'resource',
          file: basename(file),
          pid: child.pid,
          parent: process.pid,
        }) + '\n'
      )
    }
    return child
  }
}

// Observe the first (outer) reporter. Dynamic-imported CommonJS entry points can
// bypass Module._load on some Node versions; their synchronous reporter import
// is still the real Next event consumer. Child and nested reporters are ignored.
if (/[/\\]dist[/\\]bin[/\\]next(?:\.js)?$/.test(process.argv[1] ?? '')) {
  const { Module } = require('node:module')
  const load = Module._load
  let observed = false
  Module._load = function (request, parent, isMain) {
    const value = Reflect.apply(load, this, arguments)
    const filename = Module._resolveFilename(request, parent, isMain)
    if (
      !String(filename).endsWith('/experimental/testing/reporting/reporter.js')
    )
      return value
    return new Proxy(value, {
      get(target, key, receiver) {
        if (key !== 'createTestReporter')
          return Reflect.get(target, key, receiver)
        return function (options) {
          const reporter = target.createTestReporter(options)
          if (observed) return reporter
          observed = true
          const onEvent = reporter.onEvent
          reporter.onEvent = function (event) {
            appendFileSync(
              process.env.NEXT_TEST_EVENT_AUDIT,
              JSON.stringify(event) + '\n'
            )
            return onEvent(event)
          }
          return reporter
        }
      },
    })
  }
}
