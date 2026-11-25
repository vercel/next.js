import { EventQueue } from './event-queue'

describe('EventQueue', () => {
  it('preserves event order while connecting', () => {
    const eventQueue = new EventQueue<(value: string) => void>()
    const events: string[] = []
    const recordEvent = (value: string) => events.push(value)

    eventQueue.enqueue((emit) => emit('queued first'))
    eventQueue.enqueue((emit) => emit('queued second'))
    eventQueue.connect(recordEvent)
    eventQueue.enqueue((emit) => emit('dispatched directly'))

    expect(events).toEqual([
      'queued first',
      'queued second',
      'dispatched directly',
    ])
  })

  it('drains events that are queued during replay', () => {
    const eventQueue = new EventQueue<(value: string) => void>()
    const events: string[] = []

    eventQueue.enqueue((emit) => {
      emit('queued first')
      eventQueue.enqueue((queuedEmit) => queuedEmit('queued during replay'))
    })

    eventQueue.connect((value) => events.push(value))

    expect(events).toEqual(['queued first', 'queued during replay'])
  })

  it('connects and clears the backlog when replay throws', () => {
    const eventQueue = new EventQueue<(value: string) => void>()
    const events: string[] = []

    eventQueue.enqueue(() => {
      throw new Error('replay failed')
    })
    eventQueue.enqueue((emit) => emit('remaining queued event'))

    expect(() => eventQueue.connect((value) => events.push(value))).toThrow(
      'replay failed'
    )

    eventQueue.enqueue((emit) => emit('new event'))

    expect(events).toEqual(['new event'])
  })
})
