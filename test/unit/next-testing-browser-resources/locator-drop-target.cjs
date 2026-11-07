const assert = require('node:assert/strict')

const mode = process.argv[2]
const {
  resolveClientCommandTarget,
} = require('next/dist/experimental/testing/client/command-target')
async function run() {
  if (mode === 'wire') {
    for (const described of [false, true]) {
      const source = {
          selector: '#source',
          ...(described ? { locator: 'source description' } : {}),
        },
        target = {
          selector: '#target',
          ...(described ? { locator: 'target description' } : {}),
        }
      assert.deepEqual(
        resolveClientCommandTarget({
          method: 'dragAndDrop',
          locator: source,
          args: [target, {}],
        }),
        { kind: 'drag', sourceSelector: '#source', targetSelector: '#target' }
      )
    }
    for (const command of [
      {
        method: 'dragAndDrop',
        locator: { selector: '#source' },
        element: undefined,
        args: [{ selector: '#target' }],
      },
      { method: 'dragAndDrop', locator: { selector: '#source' }, args: [] },
      {
        method: 'dragAndDrop',
        locator: { selector: '#source' },
        args: [{ selector: '#target' }, {}, {}],
      },
      {
        method: 'dragAndDrop',
        locator: { selector: '#source' },
        args: ['next-test-element-0'],
      },
      {
        method: 'dragAndDrop',
        locator: { selector: '#source' },
        args: [{ selector: 1 }],
      },
      {
        method: 'dragAndDrop',
        locator: { selector: 1 },
        args: [{ selector: '#target' }],
      },
    ])
      assert.throws(
        () => resolveClientCommandTarget(command),
        /Invalid Browser Mode element command/
      )
  } else {
    const {
      createLocatorTargetFixture,
    } = require('./locator-target-fixture.cjs')
    const fixture = createLocatorTargetFixture({
      html: '<!DOCTYPE html><body><div data-testid="source"></div><div data-testid="target"></div></body>',
      legacy: mode === 'legacy',
      recordOrigin: true,
    })
    const { api, late, commands, task, hook, leave } = fixture
    let left = false,
      lateFailure
    try {
      const source = api.page.getByTestId('source'),
        target = api.page.getByTestId('target'),
        trace = [],
        sd = { selector: '#initial-source' },
        td = { selector: '#initial-target' },
        options = { timeout: 1234 },
        fn = source.dropTo
      if (mode === 'legacy') {
        for (const value of [source, target])
          Object.defineProperty(value, 'toJSON', {
            get() {
              throw new Error('unused legacy serialization')
            },
          })
        await source.dropTo(target)
        assert.equal(commands.length, 1)
        assert.equal(commands[0].command.method, 'dragAndDrop')
        assert.equal(
          commands[0].command.element,
          document
            .querySelector('[data-testid="source"]')
            .getAttribute('data-next-test-element')
        )
        assert.equal(
          commands[0].command.args[0],
          document
            .querySelector('[data-testid="target"]')
            .getAttribute('data-next-test-element')
        )
        assert.equal(commands[0].command.args.length, 1)
      } else {
        for (const [role, value, descriptor] of [
          ['source', source, sd],
          ['target', target, td],
        ]) {
          Object.defineProperty(value, 'toJSON', {
            configurable: true,
            value: function () {
              assert.equal(this, value)
              assert.equal(arguments.length, 0)
              trace.push(role)
              return descriptor
            },
          })
          for (const key of ['query', 'serialize'])
            Object.defineProperty(value, key, {
              get() {
                throw new Error('unused ' + key)
              },
            })
        }
        if (mode === 'default') {
          const seen = [],
            sentinel = {}
          Object.defineProperty(source, 'action', {
            get() {
              trace.push('action:get')
              return function (command, args, opts, descriptor) {
                assert.equal(this, source)
                assert.equal(arguments.length, 4)
                assert.equal(command, '__vitest_dragAndDrop')
                assert.equal(args[0], td)
                assert.equal(descriptor, sd)
                assert.deepEqual(opts, {})
                seen.push(opts)
                trace.push('action:call')
                return sentinel
              }
            },
          })
          assert.equal(source.dropTo(target), sentinel)
          assert.equal(source.dropTo(target), sentinel)
          assert.notEqual(seen[0], seen[1])
          assert.deepEqual(trace, [
            'action:get',
            'target',
            'source',
            'action:call',
            'action:get',
            'target',
            'source',
            'action:call',
          ])
          assert.equal(commands.length, 0)
        } else if (mode === 'errors') {
          for (const role of ['target', 'source']) {
            const value = role === 'target' ? target : source,
              original = Object.getOwnPropertyDescriptor(value, 'toJSON'),
              marker = { role }
            Object.defineProperty(value, 'toJSON', {
              configurable: true,
              get() {
                trace.push(role + ':get')
                throw marker
              },
            })
            assert.throws(
              () => source.dropTo(target, options),
              (error) => error === marker
            )
            assert.equal(commands.length, 0)
            Object.defineProperty(value, 'toJSON', original)
          }
          const marker = { action: true }
          Object.defineProperty(source, 'action', {
            get() {
              throw marker
            },
          })
          assert.throws(
            () => source.dropTo(target, options),
            (error) => error === marker
          )
        } else {
          let receiver = source,
            argument = target,
            sourceReads = 0
          const errorSource = new Error('actual drag source')
          if (mode === 'receiver') {
            receiver = {
              action: source.action,
              toJSON() {
                trace.push('source')
                assert.equal(this, receiver)
                return sd
              },
            }
            argument = {
              toJSON() {
                trace.push('target')
                assert.equal(this, argument)
                return td
              },
            }
            Object.defineProperty(receiver, '_errorSource', {
              get() {
                sourceReads++
                return errorSource
              },
            })
          }
          const action = Reflect.apply(fn, receiver, [argument, options])
          assert.deepEqual(trace, ['target', 'source'])
          assert.equal(commands.length, mode === 'receiver' ? 1 : 0)
          sd.selector = '#actual-source'
          td.selector = '#actual-target'
          options.timeout = 4321
          if (mode === 'late') {
            leave()
            left = true
            hook.close()
            await assert.rejects(action, (error) => {
              lateFailure = error
              return /closed|scope|outside|active/i.test(error.message)
            })
            assert.equal(commands.length, 0)
          } else {
            assert.equal(await action, undefined)
            assert.equal(commands.length, 1)
            assert.equal(commands[0].command.locator, sd)
            assert.equal(commands[0].command.args[0], td)
            assert.equal(commands[0].command.args[1], options)
            assert.equal(commands[0].command.locator.selector, '#actual-source')
            assert.equal(commands[0].command.args[0].selector, '#actual-target')
            if (mode === 'receiver') {
              assert.equal(sourceReads, 1)
              assert.equal(commands[0].source, errorSource)
            }
          }
        }
      }
      for (const finish of task.onFinished) finish()
      assert.deepEqual(late, mode === 'late' ? [lateFailure] : [])
    } finally {
      fixture.dispose(left)
    }
  }
  console.log(
    JSON.stringify({
      mode,
      actualDualTargetConsumer: true,
      descriptorAndReceiverOrder: true,
      legacyAndLifetimePreserved: true,
    })
  )
}
run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
