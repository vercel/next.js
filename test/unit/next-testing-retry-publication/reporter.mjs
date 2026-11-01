import { appendFileSync } from 'node:fs'
const trace = process.env.NEXT_TESTING_RETRY_PUBLICATION_TRACE
const record = (value) => appendFileSync(trace, JSON.stringify(value) + '\n')
function snapshot(module) {
  return [...module.children.allTests()].map((test) => {
    const retry = test.options.retry
    const metadata =
      retry && typeof retry === 'object' ? retry.metadata : undefined
    const count =
      retry && typeof retry === 'object'
        ? Object.getOwnPropertyDescriptor(retry, 'count')
        : undefined
    const value =
      metadata && typeof metadata === 'object'
        ? Object.getOwnPropertyDescriptor(metadata, 'value')
        : undefined
    return {
      name: test.name,
      retry,
      metadata,
      countDescriptor: count
        ? {
            hasValue: Object.hasOwn(count, 'value'),
            getter: typeof count.get,
            value: count.value,
          }
        : null,
      ...(test.name === 'reporter retry identity' ? { meta: test.meta() } : {}),
      metadataValueDescriptor: value
        ? {
            hasValue: Object.hasOwn(value, 'value'),
            getter: typeof value.get,
            value: value.value,
          }
        : null,
    }
  })
}
export default class {
  held
  onUserConsoleLog(log) {
    for (const line of log.content.split('\n'))
      if (line.startsWith('RETRY_PUBLICATION_ROW '))
        appendFileSync(trace, line.slice(22) + '\n')
  }
  onTestModuleCollected(module) {
    record({
      actor: 'reporter',
      phase: 'collected',
      module: module.relativeModuleId,
      cases: snapshot(module),
    })
    if (module.relativeModuleId.endsWith('identity.test.mjs')) {
      this.held = [...module.children.allTests()][0].options.retry
      this.held.metadata.nested.value = 73
      this.held.fromReporter = 111
      record({
        actor: 'reporter',
        phase: 'mutated',
        module: module.relativeModuleId,
        value: this.held.metadata.nested.value,
        fromReporter: this.held.fromReporter,
      })
    }
  }
  onTestModuleEnd(module) {
    record({
      actor: 'reporter',
      phase: 'end',
      module: module.relativeModuleId,
      cases: snapshot(module),
    })
    if (module.relativeModuleId.endsWith('identity.test.mjs'))
      record({
        actor: 'reporter',
        phase: 'retained',
        module: module.relativeModuleId,
        sameRetry:
          [...module.children.allTests()][0].options.retry === this.held,
        value: this.held.metadata.nested.value,
        fromReporter: this.held.fromReporter,
      })
  }
}
