import { warnOnce } from 'next/dist/build/output/log'

describe('build/output/log', () => {
  it('warnOnce', () => {
    const original = console.warn
    try {
      const messages = []
      console.warn = (m: any) => messages.push(m)
      warnOnce('test')
      expect(messages.length).toEqual(1)
      warnOnce('test again')
      expect(messages.length).toEqual(2)
      warnOnce('test', 'more')
      expect(messages.length).toEqual(3)
      warnOnce('test')
      expect(messages.length).toEqual(3)
      warnOnce('test again')
      expect(messages.length).toEqual(3)
      warnOnce('test', 'more')
      expect(messages.length).toEqual(3)
      warnOnce('test', 'should', 'add', 'another')
      expect(messages.length).toEqual(4)
    } finally {
      console.warn = original
    }
  })
})
