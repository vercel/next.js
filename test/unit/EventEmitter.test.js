/* eslint-env jest */
import EventEmitter from 'next-server/dist/lib/EventEmitter'

describe('EventEmitter', () => {
  describe('With listeners', () => {
    it('should listen to a event', (done) => {
      const ev = new EventEmitter()
      ev.on('sample', done)
      ev.emit('sample')
    })

    it('should listen to multiple listeners', () => {
      const ev = new EventEmitter()
      let cnt = 0

      ev.on('sample', () => { cnt += 1 })
      ev.on('sample', () => { cnt += 1 })

      ev.emit('sample')

      expect(cnt).toBe(2)
    })

    it('should listen to multiple events', () => {
      const ev = new EventEmitter()
      const data = []
      const cb = (name) => { data.push(name) }

      ev.on('sample1', cb)
      ev.on('sample2', cb)

      ev.emit('sample1', 'one')
      ev.emit('sample2', 'two')

      expect(data).toEqual(['one', 'two'])
    })

    it('should support multiple arguments', () => {
      const ev = new EventEmitter()
      let data

      ev.on('sample', (...args) => { data = args })
      ev.emit('sample', 'one', 'two')

      expect(data).toEqual(['one', 'two'])
    })

    it('should possible to stop listening an event', () => {
      const ev = new EventEmitter()
      let cnt = 0
      const cb = () => { cnt += 1 }

      ev.on('sample', cb)

      ev.emit('sample')
      expect(cnt).toBe(1)

      ev.off('sample', cb)

      ev.emit('sample')
      expect(cnt).toBe(1)
    })

    it('should throw when try to add the same listener multiple times', () => {
      const ev = new EventEmitter()
      const cb = () => {}

      ev.on('sample', cb)

      const run = () => ev.on('sample', cb)

      expect(run).toThrow(/The listener already exising in event: sample/)
    })

    it('should support chaining like the nodejs EventEmitter', () => {
      const emitter = new EventEmitter()
      let calledA = false
      let calledB = false

      emitter
        .on('a', () => { calledA = true })
        .on('b', () => { calledB = true })

      emitter.emit('a')
      emitter.emit('b')

      expect(calledA).toEqual(true)
      expect(calledB).toEqual(true)
    })

    it('should return an indication on emit if there were listeners', () => {
      const emitter = new EventEmitter()
      emitter.on('a', () => { })

      expect(emitter.emit('a')).toEqual(true)
      expect(emitter.emit('b')).toEqual(false)
    })
  })

  describe('Without a listener', () => {
    it('should not fail to emit', () => {
      const ev = new EventEmitter()
      ev.emit('aaaa', 10, 20)
    })
  })
})
