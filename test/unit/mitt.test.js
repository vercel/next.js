/* global fixture, test */
import 'testcafe'
import mitt from 'next/dist/next-server/lib/mitt'

fixture('mitt')

test('should listen to a event', async t => {
  const ev = mitt()
  const done = new Promise(resolve => {
    ev.on('sample', () => resolve())
  })
  ev.emit('sample')
  await done
})

test('should listen to multiple listeners', async t => {
  const ev = mitt()
  let cnt = 0

  ev.on('sample', () => {
    cnt += 1
  })
  ev.on('sample', () => {
    cnt += 1
  })

  ev.emit('sample')

  await t.expect(cnt).eql(2)
})

test('should listen to multiple events', async t => {
  const ev = mitt()
  const data = []
  const cb = name => {
    data.push(name)
  }

  ev.on('sample1', cb)
  ev.on('sample2', cb)

  ev.emit('sample1', 'one')
  ev.emit('sample2', 'two')

  await t.expect(data).eql(['one', 'two'])
})

test('should support multiple arguments', async t => {
  const ev = mitt()
  let data

  ev.on('sample', (...args) => {
    data = args
  })
  ev.emit('sample', 'one', 'two')

  await t.expect(data).eql(['one', 'two'])
})

test('should possible to stop listening an event', async t => {
  const ev = mitt()
  let cnt = 0
  const cb = () => {
    cnt += 1
  }

  ev.on('sample', cb)

  ev.emit('sample')
  await t.expect(cnt).eql(1)

  ev.off('sample', cb)

  ev.emit('sample')
  await t.expect(cnt).eql(1)
})

test('should not fail to emit', async t => {
  const ev = mitt()
  ev.emit('aaaa', 10, 20)
})
