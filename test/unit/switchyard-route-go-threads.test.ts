import { routeGoMaxProcs } from 'next/dist/server/lib/switchyard-route-go-threads'

// The thread limit (GOMAXPROCS) Node starts each route.go worker with. It
// applies to the workers, which run the app's Go handlers, not to
// Switchyard's own process.
describe('switchyard-route-go-threads', () => {
  const on = { __NEXT_EXPERIMENTAL_SWITCHYARD: '1' }

  it('leaves workers alone without Switchyard', () => {
    expect(routeGoMaxProcs({}, 16)).toBeUndefined()
    expect(
      routeGoMaxProcs(
        { __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS: '2' },
        16
      )
    ).toBeUndefined()
  })

  it('limits workers to 4 threads on machines with more cores', () => {
    expect(routeGoMaxProcs(on, 16)).toBe('4')
  })

  it('limits workers to the available cores on smaller machines', () => {
    // A 2-CPU container on a large host: Go 1.24 would use every host core.
    expect(routeGoMaxProcs(on, 4)).toBe('4')
    expect(routeGoMaxProcs(on, 2)).toBe('2')
  })

  it('uses __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS when set', () => {
    expect(
      routeGoMaxProcs(
        { ...on, __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS: '8' },
        16
      )
    ).toBe('8')
    // Over GOMAXPROCS, which applies to Switchyard as well as the workers.
    expect(
      routeGoMaxProcs(
        {
          ...on,
          GOMAXPROCS: '12',
          __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS: '2',
        },
        16
      )
    ).toBe('2')
  })

  it("keeps the user's GOMAXPROCS when only that is set", () => {
    expect(routeGoMaxProcs({ ...on, GOMAXPROCS: '12' }, 16)).toBeUndefined()
  })

  it('accepts the values Go accepts', () => {
    for (const value of ['08', '2147483647']) {
      expect(
        routeGoMaxProcs(
          { ...on, __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS: value },
          16
        )
      ).toBe(value)
    }
  })

  it('ignores a value Go would not accept', () => {
    for (const value of ['', '0', '-1', '+8', '2.5', 'four', '2147483648']) {
      expect(
        routeGoMaxProcs(
          { ...on, __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS: value },
          16
        )
      ).toBe('4')
    }
  })
})
