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

  it("keeps Go's one thread per core on machines with 4 cores or fewer", () => {
    expect(routeGoMaxProcs(on, 4)).toBeUndefined()
    expect(routeGoMaxProcs(on, 2)).toBeUndefined()
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

  it('ignores a value that is not a positive whole number', () => {
    for (const value of ['', '0', '-1', '2.5', 'four']) {
      expect(
        routeGoMaxProcs(
          { ...on, __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS: value },
          16
        )
      ).toBe('4')
    }
  })
})
