import { RenderingMode } from '../../../build/rendering-mode'
import { SharedRevalidateTimings } from './shared-revalidate-timings'

describe('SharedRevalidateTimings', () => {
  let sharedRevalidateTimings: SharedRevalidateTimings
  let prerenderManifest

  beforeEach(() => {
    prerenderManifest = {
      routes: {
        '/route1': {
          initialRevalidateSeconds: 10,
          dataRoute: null,
          srcRoute: null,
          prefetchDataRoute: null,
          experimentalPPR: undefined,
          renderingMode: RenderingMode.STATIC,
          allowHeader: [],
        },
        '/route2': {
          initialRevalidateSeconds: 20,
          dataRoute: null,
          srcRoute: null,
          prefetchDataRoute: null,
          experimentalPPR: undefined,
          renderingMode: RenderingMode.STATIC,
          allowHeader: [],
        },
      },
      dynamicRoutes: {},
    }
    sharedRevalidateTimings = new SharedRevalidateTimings(prerenderManifest)
  })

  afterEach(() => {
    sharedRevalidateTimings.clear()
  })

  it('should get revalidate timing from in-memory cache', () => {
    sharedRevalidateTimings.set('/route1', 15)
    const revalidate = sharedRevalidateTimings.get('/route1')
    expect(revalidate).toBe(15)
  })

  it('should get revalidate timing from prerender manifest if not in cache', () => {
    const revalidate = sharedRevalidateTimings.get('/route2')
    expect(revalidate).toBe(20)
  })

  it('should return undefined if revalidate timing not found', () => {
    const revalidate = sharedRevalidateTimings.get('/route3')
    expect(revalidate).toBeUndefined()
  })

  it('should set revalidate timing in cache', () => {
    sharedRevalidateTimings.set('/route3', 30)
    const revalidate = sharedRevalidateTimings.get('/route3')
    expect(revalidate).toBe(30)
  })

  it('should clear the in-memory cache', () => {
    sharedRevalidateTimings.set('/route3', 30)
    sharedRevalidateTimings.clear()
    const revalidate = sharedRevalidateTimings.get('/route3')
    expect(revalidate).toBeUndefined()
  })
})
