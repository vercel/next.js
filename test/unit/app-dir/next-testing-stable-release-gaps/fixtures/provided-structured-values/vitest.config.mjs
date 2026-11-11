export default {
  test: {
    include: ['*.case.mjs'],
    provide: {
      date: new Date('2026-01-02T03:04:05.000Z'),
      map: new Map([['key', 42]]),
      big: 42n,
    },
  },
}
