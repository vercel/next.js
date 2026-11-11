import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'

const names = [
  'array metadata',
  'count publication',
  'inherits suite retry',
  'nested getter publication',
  'object metadata',
  'replaces suite retry',
  'reporter retry identity',
  'worker live retry count',
]

function assertPublishedRetry(test, phase) {
  const retry = test.options.retry
  const count = Object.getOwnPropertyDescriptor(retry, 'count')
  assert.equal(typeof count.get, 'undefined')
  assert.equal(count.value, test.name === 'count publication' ? 1 : 0)

  switch (test.name) {
    case 'array metadata':
      assert.deepEqual(retry.metadata, [42, { value: 7 }])
      break
    case 'object metadata':
      assert.deepEqual(retry.metadata, { nested: { value: 42 } })
      break
    case 'nested getter publication': {
      const value = Object.getOwnPropertyDescriptor(retry.metadata, 'value')
      assert.equal(typeof value.get, 'undefined')
      assert.equal(value.value, 42)
      break
    }
    case 'reporter retry identity':
      assert.equal(retry.metadata.nested.value, phase === 'collected' ? 42 : 73)
      assert.equal(retry.fromReporter, phase === 'collected' ? undefined : 111)
      break
    case 'inherits suite retry':
      assert.deepEqual(retry.metadata, { value: 42 })
      break
    case 'replaces suite retry':
      assert.deepEqual(retry.metadata, [7])
      break
    default:
      assert.equal(retry.metadata, undefined)
  }
}

export default class {
  collected = new Set()
  ended = new Set()
  held

  onTestModuleCollected(module) {
    for (const test of module.children.allTests()) {
      assertPublishedRetry(test, 'collected')
      assert(!this.collected.has(test.name))
      this.collected.add(test.name)
      if (test.name === 'reporter retry identity') {
        this.held = test.options.retry
        this.held.metadata.nested.value = 73
        this.held.fromReporter = 111
      }
    }
  }

  onTestModuleEnd(module) {
    for (const test of module.children.allTests()) {
      assert(this.collected.has(test.name))
      assertPublishedRetry(test, 'end')
      this.ended.add(test.name)
      if (test.name === 'reporter retry identity') {
        assert.equal(test.options.retry, this.held)
        assert.equal(test.meta().marker, 'worker live')
      }
    }
  }

  onTestRunEnd() {
    assert.deepEqual([...this.collected].sort(), names)
    assert.deepEqual([...this.ended].sort(), names)
    writeFileSync(
      process.env.NEXT_TESTING_RETRY_PUBLICATION_RESULT,
      JSON.stringify({ collected: this.collected.size, ended: this.ended.size })
    )
  }
}
